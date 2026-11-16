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

The command asks three questions:

1. **The funding link** from the organizer. The input is hidden. Keep the link private.
   Press Enter if you fund the contribution address yourself.
2. **Your name.** It goes on-chain and into the final ceremony transcript.
3. **Some random text.** The input is hidden. The CLI also mixes in randomness
   from your operating system.

Then the CLI shows a summary and asks you to confirm. After that you can walk away.
The run looks like this:

```text
  ✓ Prepare              received 0.06 SUI, 0.30 WAL from the organizer
  ✓ Wait for your turn   waited 12m 04s
  ✓ Download             113.8 MB in 7s
  ⠸ Compute              ██████████░░░░░░░░░░  52%  1m 38s
  · Upload
  · Submit and verify

  Your turn ends in 11m 20s. Keep this terminal open.
  Log: ceremony-work/testnet/0xbdd9…/logs/contributor.log
```

The steps are:

1. **Prepare.** The CLI makes a contribution key and makes sure that it has enough SUI and WAL.
2. **Wait for your turn.** One contributor has the slot at a time. The CLI claims the slot when it is free.
   A turn has a time limit, 15 minutes by default, from the claim to the submission.
3. **Download.** It gets the current parameters from Walrus, about 115 MB, and checks them
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
| Circuit | zkLogin v2 |
| Network and ceremony object | Named in [`ceremony.json`](ceremony.json) |
| Phase 1 | `challenge_0087` of the Perpetual Powers of Tau (86 contributions), reduced from 2^28 to 2^21, with drand round 6440000 as the final beacon |
| Final beacon of phase 2 | Drawn on-chain from Sui randomness when the organizer ends the contributions |

The [repository README](../../README.md) describes how the ceremony works.
