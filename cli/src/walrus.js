// Walrus dependency boundary for the ceremony contributor. Review SharedBlob
// resolution, aggregator downloads, and upload/storage policy here.
// Callers supply network configuration and own contribution orchestration.
// Downloaded bytes are checked against the content ID resolved from chain.
import { Transaction } from '@mysten/sui/transactions';
import { WalrusClient, blobIdFromInt } from '@mysten/walrus';
import { signTransaction } from './crypto.js';

// Download a blob and check its bytes against `blobId`.
//
// 1. Ask the aggregator. This is one HTTPS request, and it is the fast path.
// 2. After a failed try, wait and try again. The wait doubles: 2, 4 and 8 seconds.
// 3. If each try fails, read the blob from the storage nodes with the SDK.
//    That read does not use the aggregator. In one test, it took 33 seconds for 123 MiB.
// A test gives its own `readFromNodes`.
export async function fetchBlob(suiClient, networkName, net, blobId, {
  tries = 4, stallMs = 60_000, waitMs = 2000, nodeReadMs = 300_000, onRetry = () => {}, onFallback = () => {},
  readFromNodes = (client, signal) => client.readBlob({ blobId, signal }),
} = {}) {
  const walrusClient = new WalrusClient({ network: networkName, suiClient });
  let aggregatorError;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try { return await checkBlob(walrusClient, blobId, await aggregatorBytes(net, blobId, stallMs), 'aggregator'); }
    catch (e) {
      aggregatorError = e;
      if (attempt === tries) break;
      const wait = waitMs * 2 ** (attempt - 1);
      onRetry({ attempt, tries, waitMs: wait, error: e });
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  onFallback({ error: aggregatorError });
  // The SDK does not stop each step at the signal. So the limit is also a race.
  // `AbortSignal.timeout` is not used: its timer does not keep the process alive.
  const controller = new AbortController();
  let timer;
  const limit = new Promise((_resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(`storage nodes sent no blob in ${nodeReadMs / 1000} seconds`);
      controller.abort(error);
      reject(error);
    }, nodeReadMs);
  });
  try {
    const bytes = await Promise.race([readFromNodes(walrusClient, controller.signal), limit]);
    return await checkBlob(walrusClient, blobId, bytes, 'storage nodes');
  } catch (e) {
    throw new Error(
      `download failed from the aggregator (${aggregatorError.message}) and from the storage nodes (${e.message})`,
      { cause: aggregatorError },
    );
  } finally {
    clearTimeout(timer);
  }
}

// Download from the aggregator. A try stops when no data arrives for `stallMs`, because the turn continues during a stall.
async function aggregatorBytes(net, blobId, stallMs) {
  const controller = new AbortController();
  let timer;
  // Start the stall timer again. A slow download that still moves has no time limit.
  const arm = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(`aggregator sent no data for ${stallMs / 1000} seconds`)), stallMs);
  };
  arm();
  try {
    const res = await fetch(`${net.aggregator}/v1/blobs/${blobId}`, { signal: controller.signal });
    if (!res.ok) throw new Error(`aggregator ${blobId}: HTTP ${res.status}`);
    const chunks = [];
    for await (const chunk of res.body) { chunks.push(chunk); arm(); }
    const all = Buffer.concat(chunks);
    return new Uint8Array(all.buffer, all.byteOffset, all.length);
  } finally {
    clearTimeout(timer);
  }
}

// The content ID comes from the chain. So the source of the bytes needs no trust.
async function checkBlob(walrusClient, blobId, bytes, source) {
  const { blobId: actualBlobId } = await walrusClient.computeBlobMetadata({ bytes });
  if (actualBlobId !== blobId) throw new Error(`${source} returned wrong blob for ${blobId}`);
  return bytes;
}

// A contribution becomes the head the next contributor downloads, and the whole
// chain must stay auditable for the ceremony's life — so blobs are persistent
// (non-deletable) and stored for many epochs, not the 1-epoch bench default.
const CONTRIB_EPOCHS = 53; // Walrus caps reservations at 53 epochs (~2y); clears the contract REQUIRED_EPOCHS (50)

export async function uploadToWalrus(suiClient, keypair, networkName, net, bytes, log = () => {}) {
  const walrusClient = new WalrusClient({
    network: networkName,
    suiClient,
    uploadRelay: { host: net.relay, sendTip: { max: 1_000_000_000 }, timeout: 600_000 },
  });
  const res = await walrusClient.writeBlob({
    blob: bytes,
    deletable: false,
    epochs: CONTRIB_EPOCHS,
    signer: keypair,
    onStep: (s) => log(`  walrus: ${s?.step ?? s}`),
  });
  const contentBlobId = res?.blobId || res?.blobObject?.blob_id;
  const blobObjectId = res?.blobObject?.id;
  if (!contentBlobId || !blobObjectId) throw new Error('walrus upload returned no blob id / object id');

  // Wrap the owned Blob in a SharedBlob (anyone can later fund/extend it); the
  // ceremony contract stores that SharedBlob's object id. The walrus package id is
  // read from the system object — nothing hardcoded.
  const walPkg = (await walrusClient.systemObject()).package_id;
  const tx = new Transaction();
  tx.moveCall({ target: `${walPkg}::shared_blob::new`, arguments: [tx.object(blobObjectId)] });
  tx.setSender(keypair.toSuiAddress());
  const built = await tx.build({ client: suiClient });
  const { signature } = await signTransaction(keypair, built);
  const out = await suiClient.core.executeTransaction({
    transaction: built, signatures: [signature],
    include: { effects: true, objectTypes: true },
  });
  const t = out.Transaction || out.FailedTransaction;
  if (out.FailedTransaction || t?.status?.success === false) {
    throw new Error(`shared_blob::new failed: ${JSON.stringify(t?.status?.error || out)}`);
  }
  let sharedBlobId = null;
  for (const c of t.effects.changedObjects) {
    if (c.idOperation !== 'Created') continue;
    if ((t.objectTypes?.[c.objectId] || '').endsWith('::shared_blob::SharedBlob')) sharedBlobId = c.objectId;
  }
  if (!sharedBlobId) throw new Error('could not find created SharedBlob in tx effects');
  // Wait for settlement so the on-chain submit builds against the bumped gas coin.
  await suiClient.core.waitForTransaction({ digest: t.digest });
  return { sharedBlobId, contentBlobId };
}

// Resolve a SharedBlob object id to the Walrus content blob id it wraps (for reads).
export async function resolveSharedBlobContent(suiClient, sharedBlobId) {
  const { object } = await suiClient.core.getObject({ objectId: sharedBlobId, include: { json: true } });
  const blob = object.json?.blob?.fields ?? object.json?.blob ?? {};
  if (blob.blob_id == null) throw new Error(`SharedBlob ${sharedBlobId} has no wrapped blob id`);
  return blobIdFromInt(BigInt(blob.blob_id));
}
