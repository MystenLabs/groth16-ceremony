import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CEREMONY_RUNS_ROOT,
  ceremonyTitle,
  ceremonyRunPaths,
  resolveCeremonyPaths,
  standaloneAuditPaths,
  validateRunName,
} from '../src/lib/config.js';

test('run name derives one self-contained ceremony directory', () => {
  const paths = ceremonyRunPaths('zklogin-mock-aug31');
  const runDir = path.join(CEREMONY_RUNS_ROOT, 'zklogin-mock-aug31');
  assert.equal(paths.runDir, runDir);
  assert.equal(paths.manifest, path.join(runDir, 'manifest.json'));
  assert.equal(paths.state, path.join(runDir, 'state.json'));
  assert.equal(paths.artifacts, path.join(runDir, 'artifacts'));
  assert.equal(paths.blobs, path.join(runDir, 'blobs'));
  assert.equal(paths.logs, path.join(runDir, 'logs'));
  assert.equal(paths.audit, path.join(runDir, 'audit'));
});

test('run names cannot escape the ceremony-runs directory', () => {
  for (const name of ['', '.', '..', '../other', 'nested/run', '/tmp/run']) {
    assert.throws(() => validateRunName(name), /missing --run|invalid run name/);
  }
});

test('explicit manifest remains available for custom run layouts', () => {
  const manifest = path.resolve('tmp/custom-manifest.json');
  const paths = resolveCeremonyPaths({ manifest });
  assert.equal(paths.manifest, manifest);
  assert.equal(paths.workdir, path.dirname(manifest));
  assert.equal(resolveCeremonyPaths({ deployments: manifest }).manifest, manifest);
  assert.equal(resolveCeremonyPaths({ out: manifest }).manifest, manifest);
});

test('run and conflicting manifest paths are rejected', () => {
  assert.throws(
    () => resolveCeremonyPaths({ run: 'one', manifest: '/tmp/another/manifest.json' }),
    /cannot be combined/,
  );
  assert.throws(() => resolveCeremonyPaths({}), /pass --run/);
});

test('standalone audits isolate a custom work root by ceremony id', () => {
  const root = path.resolve('tmp/audit-work');
  const paths = standaloneAuditPaths('0xabcdef0123456789', root);
  assert.equal(paths.audit, path.join(root, 'abcdef012345', 'audit'));
  assert.equal(paths.blobs, path.join(root, 'abcdef012345', 'blobs'));
});

test('the ceremony title comes from the ceremony file with the same network and id', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ceremony-title-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const id = '0x' + 'a'.repeat(64);
  assert.equal(ceremonyTitle('testnet', id, root), null);
  const add = (name, text) => {
    fs.mkdirSync(path.join(root, 'ceremonies', name), { recursive: true });
    fs.writeFileSync(path.join(root, 'ceremonies', name, 'ceremony.json'), text);
  };
  add('broken', '{');
  add('other', JSON.stringify({ ceremonyId: '0x' + 'b'.repeat(64), network: 'testnet', title: 'Other' }));
  add('mine', JSON.stringify({ ceremonyId: id.toUpperCase().replace('0X', '0x'), network: 'testnet', title: ' Mine ' }));
  assert.equal(ceremonyTitle('testnet', id, root), 'Mine');
  assert.equal(ceremonyTitle('mainnet', id, root), null);
});
