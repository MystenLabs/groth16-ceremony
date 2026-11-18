import test from 'node:test';
import assert from 'node:assert/strict';
import { WalrusClient } from '@mysten/walrus';
import { SuiGrpcClient } from '@mysten/sui/grpc';
import { fetchBlob } from '../src/walrus.js';

test('aggregator downloads verify content before returning bytes', async (t) => {
  // Stub network I/O; use the real SDK/WASM content-ID computation.
  const numShards = 10;
  const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://sui.example' });
  const client = new WalrusClient({ network: 'testnet', suiClient });
  const bytes = new TextEncoder().encode('ceremony predecessor params');
  const { blobId } = await client.computeBlobMetadata({ bytes, numShards });
  t.mock.method(WalrusClient.prototype, 'systemState', async () => ({ committee: { n_shards: numShards } }));
  // The storage nodes also fail. So each aggregator fault is the result of the download.
  const readFromNodes = async () => { throw new Error('storage nodes are not available'); };
  const net = { aggregator: 'https://aggregator.example' };
  let responseBytes = bytes;
  let status = 200;
  t.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url, `${net.aggregator}/v1/blobs/${blobId}`);
    return new Response(responseBytes, { status });
  });

  assert.deepEqual(await fetchBlob(suiClient, 'testnet', net, blobId), bytes);

  responseBytes = bytes.slice();
  responseBytes[0] ^= 1;
  await assert.rejects(fetchBlob(suiClient, 'testnet', net, blobId, { waitMs: 1, readFromNodes }), /aggregator returned wrong blob/);

  responseBytes = bytes.subarray(0, bytes.length - 1);
  await assert.rejects(fetchBlob(suiClient, 'testnet', net, blobId, { waitMs: 1, readFromNodes }), /aggregator returned wrong blob/);

  status = 503;
  await assert.rejects(fetchBlob(suiClient, 'testnet', net, blobId, { waitMs: 1, readFromNodes }), /HTTP 503/);

  // One failed try, then a good answer.
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => new Response(bytes, { status: ++calls === 1 ? 503 : 200 }));
  assert.deepEqual(await fetchBlob(suiClient, 'testnet', net, blobId, { waitMs: 1, readFromNodes }), bytes);
  assert.equal(calls, 2);
});

test('a download tries the aggregator 4 times, then reads from the storage nodes', async (t) => {
  const numShards = 10;
  const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://sui.example' });
  const client = new WalrusClient({ network: 'testnet', suiClient });
  const bytes = new TextEncoder().encode('ceremony predecessor params');
  const { blobId } = await client.computeBlobMetadata({ bytes, numShards });
  t.mock.method(WalrusClient.prototype, 'systemState', async () => ({ committee: { n_shards: numShards } }));
  let calls = 0;
  // The name of the aggregator does not resolve. This is the fault that a contributor had.
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    throw new TypeError('fetch failed', { cause: new Error('getaddrinfo ENOTFOUND aggregator.example') });
  });
  // Run the wait timers at once, and keep the wait that the code asked for.
  // The stall timer and the storage node limit are 60 seconds or more. They do not run.
  const waits = [];
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => {
    if (ms >= 60_000) return 0;
    waits.push(ms);
    queueMicrotask(fn);
    return 0;
  });
  let nodeBytes = bytes;
  let nodeReads = 0;
  const readFromNodes = async (client, signal) => {
    assert.ok(client instanceof WalrusClient);
    assert.ok(signal instanceof AbortSignal);
    nodeReads++;
    return nodeBytes;
  };
  const events = [];
  const net = { aggregator: 'https://aggregator.example' };
  const options = {
    readFromNodes,
    onRetry: (r) => events.push(`retry ${r.attempt}/${r.tries} ${r.waitMs}`),
    onFallback: ({ error }) => events.push(`fallback ${error.message}`),
  };

  assert.deepEqual(await fetchBlob(suiClient, 'testnet', net, blobId, options), bytes);
  assert.equal(calls, 4);
  assert.deepEqual(waits, [2000, 4000, 8000]);
  assert.deepEqual(events, ['retry 1/4 2000', 'retry 2/4 4000', 'retry 3/4 8000', 'fallback fetch failed']);
  assert.equal(nodeReads, 1);

  // Bytes from the storage nodes get the same check as bytes from the aggregator.
  nodeBytes = bytes.slice();
  nodeBytes[0] ^= 1;
  await assert.rejects(fetchBlob(suiClient, 'testnet', net, blobId, { readFromNodes }), (e) => {
    assert.match(e.message, /from the aggregator \(fetch failed\) and from the storage nodes \(storage nodes returned wrong blob/);
    assert.equal(e.cause.cause.message, 'getaddrinfo ENOTFOUND aggregator.example');
    return true;
  });
});

test('a read from the storage nodes that does not end stops at the limit', async (t) => {
  const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://sui.example' });
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('fetch failed'); });
  // This read ignores the signal, as some steps of the SDK do.
  const readFromNodes = () => new Promise(() => {});
  const net = { aggregator: 'https://aggregator.example' };
  await assert.rejects(
    fetchBlob(suiClient, 'testnet', net, 'blob', { tries: 1, nodeReadMs: 20, readFromNodes }),
    /from the aggregator \(fetch failed\) and from the storage nodes \(storage nodes sent no blob in 0\.02 seconds\)/,
  );
});

test('a download stops when the aggregator sends no data', async (t) => {
  const suiClient = new SuiGrpcClient({ network: 'testnet', baseUrl: 'https://sui.example' });
  let calls = 0;
  t.mock.method(globalThis, 'fetch', (_url, { signal }) => new Promise((_resolve, reject) => {
    calls++;
    signal.addEventListener('abort', () => reject(signal.reason));
  }));
  const readFromNodes = async () => { throw new Error('storage nodes are not available'); };
  const net = { aggregator: 'https://aggregator.example' };
  await assert.rejects(fetchBlob(suiClient, 'testnet', net, 'blob', { tries: 2, stallMs: 20, waitMs: 1, readFromNodes }), /sent no data/);
  assert.equal(calls, 2);
});
