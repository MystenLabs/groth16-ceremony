# zkLogin v2 ceremony

These are the instructions for a contributor to the zkLogin v2 trusted-setup ceremony.
The ceremony makes the Groth16 proving and verification keys for the zkLogin v2 circuit.

## Before you start

- You need an invitation from the organizer. The ceremony uses an allowlist.
- You need Git and Node.js 22, 24, or 26. With nvm: `nvm install 24 && nvm use 24`.
- You need a machine that can stay on for your turn. Keep the terminal open and the laptop lid up.

## Contribute

```bash
git clone https://github.com/MystenLabs/groth16-ceremony.git
./groth16-ceremony/ceremony contribute zklogin-v2
```

The command asks these questions:

1. **The funding link** from the organizer. The input is hidden. Keep the link private.
   Press Enter if you fund the contribution address yourself.
2. **Your name and your organization.** They go on-chain and into the final ceremony
   transcript as "Name (Organization)". Press Enter for no organization.
3. **Some random text.** The input is hidden. The CLI also mixes in randomness
   from your operating system.

Then the CLI shows a summary and asks you to confirm. After that you can walk away.
The run looks like this:

```text
  ✓ Prepare              received 0.10 SUI, 6.00 WAL from the organizer
  ✓ Wait for your turn   waited 12m 04s
  ✓ Download             122.5 MB in 10s
  ⠸ Compute              ██████████░░░░░░░░░░  52%  1m 38s
  · Upload
  · Submit and verify

  Your turn ends in 11m 20s. Keep this terminal open.
  Log: ceremony-work/mainnet/0x…/logs/contributor.log
```

The steps are:

1. **Prepare.** The CLI makes a contribution key and makes sure that it has enough SUI and WAL.
2. **Wait for your turn.** One contributor has the slot at a time. The CLI claims the slot when it is free.
   A turn has a time limit, 15 minutes by default, from the claim to the submission.
   The CLI does not start the upload with less than 3 minutes left in the turn.
3. **Download.** It gets the current parameters from Walrus, about 123 MB, and checks them
   against the content ID on-chain.
4. **Compute.** It adds your contribution.
5. **Upload.** It stores the result on Walrus.
6. **Submit and verify.** It submits the contribution on Sui and waits up to 10 minutes
   for the coordinator to verify and accept it.

On the first run, the launcher installs the CLI dependencies. The CLI stops the machine
from idle sleep when it can. A laptop still needs an open lid.

## After your contribution

- The CLI shows your contribution hash and the path to your receipt.
- Publish the hash, so that others can check that the final transcript includes it.
- The [status page](https://zkceremony.sui.io/status) shows the accepted contributions.

### Find your hash on-chain

Your receipt file has the values for this check:

- `contributionHash`: your contribution hash in hexadecimal. The ceremony record uses this form.
- `contributionHashBase64`: the same 64 bytes in base64. A Sui explorer shows this form.
- `submitDigest`: the transaction that submitted your contribution.

To see the hash in a Sui explorer:

1. Open the transaction `submitDigest` on Sui mainnet. The CLI prints a link to it.
2. Open its events. The `ContributionSubmitted` event has the field `contribution_hash`.
   It must be equal to `contributionHashBase64`.
3. The ceremony object shows the same value. Each entry of its `chain` field has a
   `contribution_hash`.

## If something goes wrong

- Run the same command again. The CLI uses the same key, funds, and name.
  A rerun always downloads and computes again. If you held the turn, a rerun
  before the turn's deadline keeps it.
- If the CLI tells you to contact the organizer, send them
  `logs/contributor.log` from the work directory. The log never contains the
  funding link or your random text.
- Ctrl-C stops the run. While you hold your turn, the CLI asks you to press
  Ctrl-C a second time, because the next run must download and compute again.
- A run that submits a contribution exits with 0 only when the ceremony accepts it.
- One key contributes once. If the chain already lists the key, the CLI stops
  and says so. To contribute again, use a new `--workdir`.
- If you stop during verification, check the status page before you
  run the command again. The contribution can still be accepted.

## Funding

The CLI checks the balance of the contribution address first:

- Enough SUI and WAL: it uses the existing funds, even with a funding link.
- Not enough funds, with a funding link: it asks the organizer's coordinator to
  enroll and fund the address.
- Not enough funds, without a funding link: it shows the address and waits for
  you to fund it. Ask the organizer to add your address to the allowlist.

The funding link is a shared credential. Do not publish it. The CLI never stores or
prints it, and removes it from the log. Automatic funding is once for each address.

After acceptance, the CLI returns leftover funds to the organizer only when the
organizer funded the address. A self-funded address keeps its leftover funds;
`./ceremony refund zklogin-v2` sends them back on request.

## Your files

```text
ceremony-work/<network>/<ceremony-object-id>/
  state.json                 your contribution key (keep it private)
  receipt-<hash>.json        one receipt for each submitted contribution
  logs/contributor.log       the progress log
```

The folder is inside the clone and does not depend on your current directory.
`./ceremony --help` lists all options, including the options for scripts.

## Ceremony facts

| Item | Value |
| --- | --- |
| Circuit | zkLogin v2, built with `circom --O2`. It has 1,997,333 constraints. The circuit source is not public, so these hashes of the R1CS file identify it. |
| R1CS `sha256` | `e7d9cb1336140b231d07235fee157403f3932b51fb4a1017a750fd284c3d894d` |
| R1CS `b2sum` | `bc8cdc434586a667aca8f5ab7c11ee14ece87e231570c43845a1cb0a8d82b268ed5dff1388f642476ad6c94c2f1451419e0a93ea57b8eb187163702f14af142f` |
| R1CS on Walrus | Blob id `kQP5kFOpd6GN48C5B2vBaZqWwyEaeIHrGc9Eb4x_Ods`. The `r1cs_blob_id` field of the ceremony object is the shared blob object `0xa30ba93ee67719f124f4b1b374e3123d4679ddc97121cb948928c131a9341991`. |
| Network | Sui mainnet |
| Ceremony object | `0xed7a3922c4eb8c7efa4392b5918118ef73f865a362a54d1260c0cbbc83e6bb71`, also in [`ceremony.json`](ceremony.json) |
| Move package | `0x59c61edc0603f301b0295a5d2a9ace510bd26df2c4ca64c8dc91aecc75d08a28` |
| Phase 1 | Contribution `0086` of the Perpetual Powers of Tau, reduced from 2^28 to 2^21, with drand round 6440000 as the final beacon. Its chain has 67 contributions, because the chain continues from contribution `0058` at contribution `0078`. |
| Phase 1 file | `ppot_0086_21.ptau`, Walrus blob id `8V0atXFR_OLyOzdVtLQ9IN6H88PQmgE9YgSD7BbeqIE`. The [prepared files page](https://github.com/mahdi-mysten/perpetualpowersoftau/tree/ppot-0086-prepared#prepared-and-truncated-files) shows how to get and verify it. |
| Phase 1 `b2sum` | `c9972d6f19100faad8382a585dac7fed6090320228c1bb0e64e32cc5689c340e4e8aeb4790eb1297649de83a798b4cebe624d9da4e74fa94d8767c4047c12a62`. The `phase1_digest` field of the ceremony object must have the same value. |
| Final beacon of phase 2 | Drawn on-chain from Sui randomness when the organizer ends the contributions |

The [repository README](../../README.md) describes how the ceremony works.
