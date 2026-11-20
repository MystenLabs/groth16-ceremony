// The machine that runs a contribution, as the coordinator sees it in the heartbeats.
// The heartbeats carry it from the first one, so the organizer knows the core count and
// the CPU of a contributor whose turn fails. Before, only the final telemetry of a
// finished run had the core count.
import os from 'node:os';

export function machineInfo({ cpus = os.cpus(), parallelism = os.availableParallelism?.(), totalmem = os.totalmem() } = {}) {
  // os.cpus() can be empty in some containers. availableParallelism() still counts the cores.
  const model = cpus[0]?.model?.trim().replace(/\s+/g, ' ') || 'unknown';
  return {
    cores: parallelism || cpus.length || null,
    cpu: model.slice(0, 120),
    memory_gb: Math.round(totalmem / 2 ** 30),
  };
}
