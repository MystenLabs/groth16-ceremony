// The refusal rules of the withdraw command.
// Why it exists: the rules are pure decisions. The tests can import them from this file.
// How it works: each function returns the normalized target address or throws an Error.

import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';

// Rule 1: the target must be a full Sui address.
// normalizeSuiAddress adds zeros to a short address. Refuse a short address instead.
export function parseWithdrawTarget(target) {
  if (!target || !isValidSuiAddress(target) || target.length !== 66) {
    throw new Error('withdraw needs a full Sui address: 0x and 64 hex digits');
  }
  return normalizeSuiAddress(target);
}

// Apply all refusal rules in order. Return the normalized target address.
// `state` is the saved state of the work folder.
export function checkWithdraw(state, target, contributionAddress, ceremonyId) {
  const dest = parseWithdrawTarget(target);

  // Rule 2: organizer funds go back to the organizer.
  // Each open payout receipt refuses, also one that does not match this ceremony.
  // A receipt with a refundDigest is closed. It does not refuse.
  const openReceipt = state?.funding && !state.funding.refundDigest;
  if (openReceipt) {
    throw new Error('the organizer funded this address; its funds go back to the organizer, not to another address');
  }

  // Rule 3: these three targets cannot be an address of the contributor.
  const forbidden = [contributionAddress, ceremonyId, '0x0'].map((address) => normalizeSuiAddress(address));
  if (forbidden.includes(dest)) {
    throw new Error('the target must be an address of yours; it cannot be the contribution address, the ceremony, or the zero address');
  }
  return dest;
}
