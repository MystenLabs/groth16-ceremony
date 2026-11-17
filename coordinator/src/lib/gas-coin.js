// Make sure that the organizer wallet has SUI in a coin object before a Walrus CLI upload.
//
// Why it exists:
// - A Sui address can hold SUI in two forms: coin objects and the address balance.
// - The Walrus CLI pays its gas only from SUI coin objects.
// - A payout of the attestor moves each SUI coin object of the wallet into the address balance.
// So at the time of `seal`, the wallet can have much SUI and no SUI coin object.
//
// How it works:
// 1. Read the SUI of the wallet in coin objects.
// 2. If it is `MIN_SUI_IN_COIN_OBJECTS` or more, do nothing.
// 3. If not, make one coin object of `SUI_COIN_OBJECT_AMOUNT` from the address balance.

import { Transaction } from '@mysten/sui/transactions';
import { exec } from './chain.js';

export const MIN_SUI_IN_COIN_OBJECTS = 1_000_000_000n; // 1 SUI
export const SUI_COIN_OBJECT_AMOUNT = 5_000_000_000n; // 5 SUI
// SUI that stays in the address balance for the gas of the transaction.
const GAS_RESERVE = 100_000_000n; // 0.1 SUI

const sui = (mist) => (Number(mist) / 1e9).toFixed(2);

// Decide the amount of the new coin object, in MIST. 0n means that no coin object is necessary.
// `balance` is the SUI balance of the wallet from `client.core.getBalance`.
export function suiCoinObjectToMake(balance) {
  if (BigInt(balance.coinBalance) >= MIN_SUI_IN_COIN_OBJECTS) return 0n;
  if (BigInt(balance.addressBalance) < SUI_COIN_OBJECT_AMOUNT + GAS_RESERVE) {
    throw new Error(`the organizer wallet has ${sui(balance.coinBalance)} SUI in coin objects and ${sui(balance.addressBalance)} SUI in the address balance; ` +
      `the Walrus CLI needs ${sui(MIN_SUI_IN_COIN_OBJECTS)} SUI in coin objects; add SUI to the wallet`);
  }
  return SUI_COIN_OBJECT_AMOUNT;
}

// Return the digest of the transaction, or null if the wallet had enough SUI in coin objects.
export async function ensureSuiCoinObject(client, keypair, log = () => {}) {
  const owner = keypair.toSuiAddress();
  const { balance } = await client.core.getBalance({ owner, coinType: '0x2::sui::SUI' });
  const amount = suiCoinObjectToMake(balance);
  if (amount === 0n) return null;
  log(`SUI in coin objects: ${sui(balance.coinBalance)}; the Walrus CLI pays gas only from coin objects`);
  const tx = new Transaction();
  // Do not use the gas coin. The transaction then does not merge the new coin object away.
  tx.transferObjects([tx.coin({ balance: amount, useGasCoin: false })], tx.pure.address(owner));
  const digest = await exec(client, keypair, tx);
  log(`made a coin object of ${sui(amount)} SUI from the address balance (${digest})`);
  return digest;
}
