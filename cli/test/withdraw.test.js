// Tests for the refusal rules of the withdraw command.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseWithdrawTarget, checkWithdraw } from '../src/withdraw.js';

const hex64 = (digit) => `0x${digit.repeat(64)}`;
const CONTRIBUTION_ADDRESS = hex64('a');
const CEREMONY = hex64('c');
const OTHER_CEREMONY = hex64('d');
const TARGET = hex64('b');
const ZERO_ADDRESS = hex64('0');

const ADDRESS_ERROR = /withdraw needs a full Sui address: 0x and 64 hex digits/;
const ORGANIZER_ERROR = /the organizer funded this address; its funds go back to the organizer/;
const TARGET_ERROR = /the target must be an address of yours/;

// A self-funded state has a key and no payout receipt.
const SELF_FUNDED = { secretKey: 'key' };
const withReceipt = (receipt) => ({ secretKey: 'key', funding: { digest: 'payout', ...receipt } });

const check = (state, target) => checkWithdraw(state, target, CONTRIBUTION_ADDRESS, CEREMONY);

const accepted = [
  ['a self-funded address can withdraw', SELF_FUNDED],
  ['a refunded organizer receipt does not refuse', withReceipt({ ceremonyId: CEREMONY, refundDigest: 'refund' })],
];
for (const [name, state] of accepted) {
  test(name, () => assert.equal(check(state, TARGET), TARGET));
}

const openReceipts = [
  ['an open organizer receipt for this ceremony refuses', withReceipt({ ceremonyId: CEREMONY })],
  ['an open organizer receipt for a different ceremony refuses', withReceipt({ ceremonyId: OTHER_CEREMONY })],
];
for (const [name, state] of openReceipts) {
  test(name, () => assert.throws(() => check(state, TARGET), ORGANIZER_ERROR));
}

const badAddresses = [
  ['a short address refuses', '0x12'],
  ['an address with a non-hex digit refuses', `0x${'b'.repeat(63)}g`],
  ['an address without the 0x prefix refuses', 'b'.repeat(64)],
  ['a missing target refuses', undefined],
  ['an empty target refuses', ''],
];
for (const [name, target] of badAddresses) {
  test(name, () => {
    assert.throws(() => parseWithdrawTarget(target), ADDRESS_ERROR);
    assert.throws(() => check(SELF_FUNDED, target), ADDRESS_ERROR);
  });
}

const forbiddenTargets = [
  ['the contribution address as the target refuses', CONTRIBUTION_ADDRESS],
  ['the ceremony id as the target refuses', CEREMONY],
  ['the zero address as the target refuses', ZERO_ADDRESS],
];
for (const [name, target] of forbiddenTargets) {
  test(name, () => assert.throws(() => check(SELF_FUNDED, target), TARGET_ERROR));
}

test('uppercase hex digits are accepted and changed to lowercase', () => {
  const upper = `0x${'B'.repeat(64)}`;
  assert.equal(parseWithdrawTarget(upper), TARGET);
  assert.equal(check(SELF_FUNDED, upper), TARGET);
});

test('the contribution address in uppercase as the target refuses', () => {
  assert.throws(() => check(SELF_FUNDED, `0x${'A'.repeat(64)}`), TARGET_ERROR);
});

test('a bad address refuses before the organizer receipt rule', () => {
  assert.throws(() => check(withReceipt({ ceremonyId: CEREMONY }), '0x12'), ADDRESS_ERROR);
});

test('an open organizer receipt refuses before the target rule', () => {
  assert.throws(() => check(withReceipt({ ceremonyId: CEREMONY }), CONTRIBUTION_ADDRESS), ORGANIZER_ERROR);
});
