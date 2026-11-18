#!/usr/bin/env node
// Ceremony audit.
//
// For a ceremony in progress, it starts from the Ceremony object id and verifies:
//   1. the r1cs and phase-1 commitments, as for a closed ceremony;
//   2. every accepted on-chain p2c blob is retrievable, its on-chain
//      contribution_hash matches the blob, and the sequence matches the head;
//   3. the full zkey of the head verifies from the genesis zkey, which the
//      audit builds from the same r1cs and phase-1 files.
//
// For a closed ceremony, it starts from the Ceremony object id and verifies:
//   1. downloaded r1cs bytes reproduce the on-chain Walrus content id, phase-1
//      bytes reproduce the on-chain digest, the downloaded r1cs matches the
//      operator's local r1cs when available, and both inputs get SHA-256/BLAKE2b
//      identities before final zkey verification;
//   2. every accepted on-chain p2c blob is retrievable, its on-chain
//      contribution_hash matches the blob, and the sequence matches final zkey;
//   3. extracting/compressing final zkey yields the final on-chain params blob;
//   4. uploaded vkey and final beacon metadata match the final zkey.

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { makeClient, readCeremony } from './lib/chain.js';
import { loadIds, log, net, readCeremonyFile, resolveCeremonyPaths, standaloneAuditPaths } from './lib/config.js';
import { auditClosedCeremony, auditInProgressCeremony, ceremonyPhase, readCeremonyRecord } from './crypto/audit.js';
import { buildGenesis } from './crypto/snarkjs.js';
import { readBlob, blobIdForFile, cacheContentBlob } from './crypto/walrus.js';

const { values: o, positionals } = parseArgs({ allowPositionals: true, options: {
  run: { type: 'string' },
  network: { type: 'string' },
  workdir: { type: 'string' },
  ptau: { type: 'string' },
  fresh: { type: 'boolean' },
} });

// The organizer gives --run. An external auditor gives a ceremony name or a ceremony object ID.
// A ceremony name is a folder of `ceremonies/`. Its ceremony.json gives the network,
// the object ID, and the Walrus blob ID of the phase-1 file.
const target = positionals[0];
let named = null;
if (target && !/^0x[0-9a-fA-F]+$/.test(target)) {
  try { named = readCeremonyFile(target); } catch (e) { console.error(e.message); process.exit(1); }
}
o.network = o.network || named?.network || 'testnet';
const paths = o.run ? resolveCeremonyPaths({ run: o.run, workdir: o.workdir }) : null;
const manifestIds = paths ? loadIds(o.network, paths.manifest) : null;
const CER = named?.ceremonyId || target || manifestIds?.ceremonyId;
if (!CER) {
  console.error('usage: node coordinator/src/audit.js <ceremony-name> [--workdir ./audit-work] [--fresh]');
  console.error('   or: node coordinator/src/audit.js <ceremony-object-id> --ptau <file> [--network testnet] [--workdir ./audit-work] [--fresh]');
  console.error('   or: node coordinator/src/audit.js --run <name> [--network testnet] [--ptau pot_final.ptau]');
  process.exit(1);
}
net(o.network);

const ZERO_ID = '0x0000000000000000000000000000000000000000000000000000000000000000';
function fail(msg) {
  throw new Error(`audit failed: ${msg}`);
}

function assertOk(cond, msg) {
  if (!cond) fail(msg);
}

function isZeroId(id) {
  return !id || id === ZERO_ID || /^0x0+$/.test(id);
}

// Find the phase-1 file: --ptau, then the run folder, then a download from Walrus.
// The audit later compares the hash of the file with the on-chain phase1_digest.
async function findPtau(blobCache) {
  const runPtau = paths && path.join(paths.artifacts, 'pot_final.ptau');
  const manifestPtau = manifestIds?.dep.phase1?.file;
  const local = o.ptau || [runPtau, manifestPtau].find((file) => file && fs.existsSync(file));
  if (local) {
    assertOk(fs.existsSync(local), `ptau not found: ${local}`);
    return local;
  }
  assertOk(named?.phase1BlobId, 'no phase-1 file is available; give --ptau <file>');
  log(`phase-1 file: download of Walrus blob ${named.phase1BlobId}`);
  return cacheContentBlob(o.network, named.phase1BlobId, { cacheDir: blobCache, suffix: '.ptau', force: o.fresh });
}

// The genesis zkey for the audit of a ceremony in progress.
// The same r1cs and phase-1 files always give the same genesis zkey.
async function ensureBaseZkey(runDir, r1cs, ptau) {
  // With --run, the organizer audits with the genesis of the run folder. --fresh builds a new one.
  const runZkey = paths && path.join(paths.artifacts, 'circuit_0000.zkey');
  if (!o.fresh && runZkey && fs.existsSync(runZkey)) {
    log(`genesis zkey from the run folder ${runZkey}`);
    return runZkey;
  }
  const outDir = path.join(runDir, 'genesis');
  const built = path.join(outDir, 'circuit_0000.zkey');
  if (o.fresh || !fs.existsSync(built)) {
    log('building the genesis zkey from the r1cs and phase-1 files; this is the longest step');
    // Build in a temporary folder. A build that stops leaves no file that looks complete.
    const tmpDir = `${outDir}.tmp-${process.pid}`;
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.mkdirSync(tmpDir, { recursive: true });
    await buildGenesis({ r1cs, ptau, outDir: tmpDir });
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.renameSync(tmpDir, outDir);
  } else {
    log(`genesis zkey from an earlier audit ${built}`);
  }
  return built;
}

async function fetchShared({ network, client, cacheDir, sharedBlobId, label, suffix }) {
  assertOk(!isZeroId(sharedBlobId), `${label} blob id is empty`);
  const blob = await readBlob(network, client, sharedBlobId, { label, cacheDir, suffix, force: o.fresh });
  log(`${label}: ${sharedBlobId} -> ${blob.contentBlobId}`);
  return blob;
}

async function main() {
  const client = makeClient(o.network);
  const standalone = paths ? null : standaloneAuditPaths(CER, o.workdir);
  const runDir = paths?.audit || standalone.audit;
  const blobCache = paths?.blobs || standalone.blobs;
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(blobCache, { recursive: true });

  const ceremony = await readCeremony(client, CER);
  const phase = ceremonyPhase(ceremony);
  log(`auditing ceremony ${CER} on ${o.network} (${phase})`);
  log(`blob cache ${blobCache}`);
  log('walrus blob reads via cli');
  const closed = phase === 'Closed';
  const { chain } = readCeremonyRecord(ceremony);
  if (!closed) log('the ceremony is in progress; this audit covers the accepted contributions so far');
  // Find the phase-1 file first. The audit then stops before the other downloads if it is missing.
  const ptau = await findPtau(blobCache);

  const r1cs = await fetchShared({
    network: o.network,
    client,
    cacheDir: blobCache,
    sharedBlobId: ceremony.r1cs_blob_id,
    label: 'r1cs',
    suffix: '.r1cs',
  });
  const recomputedR1csBlobId = blobIdForFile(o.network, r1cs.file, { label: 'audited r1cs', log });
  const recordedR1cs = manifestIds?.dep.r1cs?.file;
  const localR1cs = recordedR1cs && fs.existsSync(recordedR1cs) ? recordedR1cs : null;
  if (!localR1cs) log('local r1cs comparison skipped; no recorded input file is available');

  const contributions = [];
  for (let i = 0; i < chain.length; i++) {
    const c = chain[i];
    const blob = await fetchShared({
      network: o.network, client, cacheDir: blobCache,
      sharedBlobId: c.blob_id, label: `chain #${i + 1} ${c.name || '(unnamed)'}`, suffix: '.p2c',
    });
    contributions.push({ sharedBlobId: c.blob_id, file: blob.file });
  }
  const common = {
    ceremony, r1cs: r1cs.file, expectedR1csBlobId: r1cs.contentBlobId,
    actualR1csBlobId: recomputedR1csBlobId, localR1cs, ptau, contributions, workdir: runDir, log,
  };
  if (!closed) {
    const getBaseZkey = () => ensureBaseZkey(runDir, r1cs.file, ptau);
    const result = await auditInProgressCeremony({ ...common, getBaseZkey });
    log(`audit OK so far (${result.contributionCount} accepted contribution${result.contributionCount === 1 ? '' : 's'}); the ceremony is in progress (${phase})`);
    return;
  }

  const finalZkey = await fetchShared({
    network: o.network,
    client,
    cacheDir: blobCache,
    sharedBlobId: ceremony.final_zkey_blob_id,
    label: 'final zkey',
    suffix: '.zkey',
  });

  const finalVkey = await fetchShared({
    network: o.network,
    client,
    cacheDir: blobCache,
    sharedBlobId: ceremony.final_vkey_blob_id,
    label: 'final vkey',
    suffix: '.json',
  });

  const result = await auditClosedCeremony({ ...common, finalZkey: finalZkey.file, finalVkey: finalVkey.file });
  log(`audit OK (${result.contributionCount} accepted contribution${result.contributionCount === 1 ? '' : 's'})`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e?.message || e);
    for (let c = e?.cause; c; c = c.cause) console.error('  cause:', c.message || c);
    process.exit(1);
  });
