// Match the on-chain MAX_SLOT_DURATION_MS limit.
const MAX_SLOT_DURATION_SECS = 60n * 60n;

// Keep the organizer CLI defaults here; Move stores an explicit duration per ceremony.
// A permissioned ceremony gets 5 more minutes. Its contributors are invited, often run
// on their own hardware, and a slow machine or a slow link to Walrus should not cost
// them the turn. On mainnet, a 4-core box needed about 15.8 minutes for one turn.
export const DEFAULT_SLOT_DURATION_SECS = '900';
export const DEFAULT_PERMISSIONED_SLOT_DURATION_SECS = '1200';

export function parseSlotDurationMs(seconds, { permissioned = false } = {}) {
  if (seconds === undefined) seconds = permissioned ? DEFAULT_PERMISSIONED_SLOT_DURATION_SECS : DEFAULT_SLOT_DURATION_SECS;
  if (typeof seconds !== 'string' || !/^[0-9]+$/.test(seconds) || BigInt(seconds) === 0n) {
    throw new Error('--slot-duration-secs must be a positive whole number of seconds');
  }
  if (BigInt(seconds) > MAX_SLOT_DURATION_SECS) {
    throw new Error(`--slot-duration-secs must be at most ${MAX_SLOT_DURATION_SECS} seconds (one hour)`);
  }
  return BigInt(seconds) * 1000n;
}
