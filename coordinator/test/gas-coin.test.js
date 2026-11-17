import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_SUI_IN_COIN_OBJECTS, SUI_COIN_OBJECT_AMOUNT, suiCoinObjectToMake } from '../src/lib/gas-coin.js';

const balance = (coinBalance, addressBalance) => ({
  balance: String(coinBalance + addressBalance), coinBalance: String(coinBalance), addressBalance: String(addressBalance),
});

test('no coin object is made when the coin objects have enough SUI', () => {
  assert.equal(suiCoinObjectToMake(balance(MIN_SUI_IN_COIN_OBJECTS, 0n)), 0n);
  assert.equal(suiCoinObjectToMake(balance(10_000_000_000n, 49_000_000_000n)), 0n);
});

test('a coin object is made when the coin objects have too little SUI', () => {
  // The state of the mainnet organizer wallet on 2026-11-17.
  assert.equal(suiCoinObjectToMake(balance(69_700_343n, 49_548_947_512n)), SUI_COIN_OBJECT_AMOUNT);
  assert.equal(suiCoinObjectToMake(balance(0n, 49_548_947_512n)), SUI_COIN_OBJECT_AMOUNT);
  assert.equal(suiCoinObjectToMake(balance(MIN_SUI_IN_COIN_OBJECTS - 1n, 49_548_947_512n)), SUI_COIN_OBJECT_AMOUNT);
});

test('a wallet with too little SUI in the address balance stops with a clear message', () => {
  assert.throws(() => suiCoinObjectToMake(balance(0n, SUI_COIN_OBJECT_AMOUNT)), /add SUI to the wallet/);
  assert.throws(() => suiCoinObjectToMake(balance(69_700_343n, 0n)), /0\.07 SUI in coin objects and 0\.00 SUI in the address balance/);
});
