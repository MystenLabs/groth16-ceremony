import assert from 'node:assert/strict';
import test from 'node:test';
import { machineInfo } from '../src/machine.js';

test('machine info gives the core count, the CPU model, and the memory', () => {
  const cpus = Array.from({ length: 4 }, () => ({ model: '  Intel(R) Xeon(R)   CPU @ 2.20GHz ' }));
  assert.deepEqual(machineInfo({ cpus, parallelism: 4, totalmem: 16 * 2 ** 30 }), { cores: 4, cpu: 'Intel(R) Xeon(R) CPU @ 2.20GHz', memory_gb: 16 });
});

test('machine info still counts the cores when the CPU list is empty', () => {
  assert.deepEqual(machineInfo({ cpus: [], parallelism: 8, totalmem: 2 ** 30 }), { cores: 8, cpu: 'unknown', memory_gb: 1 });
});

test('machine info on this host is well formed', () => {
  const m = machineInfo();
  assert.ok(Number.isInteger(m.cores) && m.cores > 0);
  assert.equal(typeof m.cpu, 'string');
});
