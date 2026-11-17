# Running a ceremony

This document is for the organizer. It shows each step from a fresh clone to a closed
and audited ceremony. Contributors need only the instructions in their ceremony folder,
for example [zkLogin v2](../ceremonies/zklogin-v2/README.md).

| Section | Content |
| --- | --- |
| [Run folder](#run-folder) | The private files of one ceremony |
| [Before you start](#before-you-start) | The machine and the wallet |
| [Steps](#steps) | The commands, in order |
| [Contributor funding](#contributor-funding) | Automatic payouts, their records, and recovery |
| [Status page and endpoints](#status-page-and-endpoints) | The HTTP server of the attestor |
| [Slot duration](#slot-duration) | The time limit of one turn |
| [Rehearsal](#rehearsal) | A small test ceremony |

## Run folder

Each ceremony has a name and one private folder. Git ignores its content.

```text
ceremony-runs/<run>/
├── manifest.json    The record of the run
├── state.json       The organizer key. Keep it secret.
├── artifacts/       The phase-1 file, the genesis files, and the final files
├── blobs/           The cache of Walrus downloads
├── logs/
└── audit/           The work files of the audit
```

- `manifest.json` records the package, the ceremony and capability identifiers, the
  commitments of the input files, the Walrus objects, and the transaction digests.
  The `Ceremony` object on Sui stays the authority for the current state.
- `key.js init` creates the folder. Later commands create the subfolders.
- Each coordinator command takes `--run <name>`. `--manifest <file>` and
  `--workdir <dir>` select another layout.
- Use one run folder for all operations on a ceremony. Two copies cannot coordinate
  the wallet and the payouts.
- Never publish the folder as a whole. Put it in a private backup.

The package publication is not in the run folder. It is in `move/Published.toml`,
which Git tracks.

## Before you start

Check these items on the machine that runs the coordinator:

- **Wallet.** The active address of the Sui CLI is the organizer wallet, and it has SUI
  and WAL. Each command that signs stops if the active address is not the address in `state.json`.
- **Walrus CLI.** The `walrus` binary and its configuration are for the network of the
  ceremony. `coordinator/scripts/install-walrus.sh` installs the testnet release by default.
- **Supervisor.** A supervisor, for example a systemd unit, restarts the attestor after
  a crash. A terminal multiplexer session does not do that.
- **Disk.** The attestor keeps each submitted file in `blobs/`, also a rejected one.
  One file can be up to 256 MiB.

Node.js 24 can print a `DEP0137` warning about a file handle after a verification.
The warning is not a failure.

## Steps

### 0. Install

```sh
# Node.js 24. The file .nvmrc names the version.
nvm install
nvm use
npm --prefix coordinator ci
npm --prefix cli ci

RUN=my-ceremony
NETWORK=testnet
```

### 1. Initialize the organizer key and the Walrus CLI

```sh
# Take the key of the active Sui CLI address as the organizer key.
node coordinator/src/key.js init --run "$RUN"

coordinator/scripts/install-walrus.sh
```

### 2. Adopt phase 1

The phase-1 file is the output of a powers-of-tau ceremony, prepared for phase 2.
Its BLAKE2b-512 hash becomes the on-chain `phase1_digest`.

```sh
mkdir -p "ceremony-runs/$RUN/artifacts"
cp <phase-1 file> "ceremony-runs/$RUN/artifacts/pot_final.ptau"

# Optional: the identifiers and hashes of the two input files.
walrus --context "$NETWORK" --json blob-id circuit.r1cs
sha256sum circuit.r1cs "ceremony-runs/$RUN/artifacts/pot_final.ptau"
b2sum circuit.r1cs "ceremony-runs/$RUN/artifacts/pot_final.ptau"
```

### 3. Create the ceremony

`create.js` uploads the R1CS file to Walrus and creates the `Ceremony` object. The
object commits the R1CS file and the `phase1_digest`.

```sh
node coordinator/src/create.js --run "$RUN" --network "$NETWORK" \
  --r1cs circuit.r1cs --ptau "ceremony-runs/$RUN/artifacts/pot_final.ptau" \
  --auditors 0xAUD1,0xAUD2 --threshold 2 --coordinator-url https://coordinator.example \
  --permissionless
```

| Option | Effect |
| --- | --- |
| `--coordinator-url` | The public address of the attestor HTTP server. It goes on-chain. |
| `--permissionless` | Any person can contribute. |
| `--permissioned [--allowlist 0xA,0xB]` | Only the addresses on the allowlist can contribute. |
| `--auditors`, `--threshold` | The auditors must approve the R1CS file before phase 2 starts. Without `--auditors`, there is no approval step. Use that only for a rehearsal. |
| `--slot-duration-secs` | The time limit of one turn. The default is 900. See [Slot duration](#slot-duration). |
| `--publish-package`, `--no-publish-package` | The answer to the publish question, for a run without a terminal. |
| `--r1cs-shared-blob 0xSHARED` | Use an R1CS file that is on Walrus already. With `--r1cs`, the local file must give the same Walrus identifier. |
| `--phase1-hash` | Declare the `phase1_digest` directly. With `--ptau`, the local file must give the same hash. |

`create.js` compiles `move/` and compares it with the package in `move/Published.toml`
for the network. It uses that package if they are equal. If not, it asks before it
publishes a new package.

### 4. Build and verify the genesis, then open phase 2

The genesis is the start of the chain. It comes from the R1CS file and the phase-1 file.

```sh
node coordinator/src/genesis.js --run "$RUN" --r1cs circuit.r1cs \
  --ptau "ceremony-runs/$RUN/artifacts/pot_final.ptau"
node coordinator/src/genesis.js verify --run "$RUN" --r1cs circuit.r1cs \
  --ptau "ceremony-runs/$RUN/artifacts/pot_final.ptau"
```

> **`genesis.js verify` is mandatory.** `start-phase2` does not check the genesis file,
> and `start_phase_2` on chain is permanent. A wrong genesis makes each contribution
> useless, and only the audit after the close shows it. Use the same `circuit.r1cs`
> file that `create.js` committed.

Then collect the approvals of the auditors, if the ceremony has auditors, and open phase 2.

```sh
node coordinator/src/admin.js approve-r1cs --run "$RUN" --network "$NETWORK"   # once per auditor
node coordinator/src/admin.js start-phase2 --run "$RUN" --network "$NETWORK" \
  --genesis "ceremony-runs/$RUN/artifacts/circuit_0000.p2c"
```

### 5. Run the attestor

The attestor verifies each submission and sends `accept` or `reject`. Its HTTP server
gives the funding, the status page, and the telemetry.

```sh
node coordinator/src/attestor.js --run "$RUN" --network "$NETWORK" --port 8090
```

The attestor takes the genesis zkey from `artifacts/` and the phase-1 file from
`manifest.json`. `--base-zkey` and `--base-ptau` select other files.

The attestor has these rules:

- A submission with a beacon entry gets a reject. Only the organizer adds a beacon
  entry, at the seal. Do not run the attestor on a ceremony whose head has a beacon entry.
- A verification process that stops or exceeds its time limit runs again. The third
  failure gives a reject. The time limit is 10 minutes (`VERIFY_TIMEOUT_MS`).
- A local fault, for example a file that the attestor cannot read, gives no verdict.
  The slot stays pending, and the attestor tries again after 60 seconds. Read the log.

The contributor CLI needs a healthy attestor before it claims a slot. See
[Status page and endpoints](#status-page-and-endpoints).

### 6. Admit contributors

Add a folder `ceremonies/<name>/` for the ceremony and commit it. It has two files:

- `ceremony.json` with the title, the network, and the ceremony object ID.
- `README.md` with the instructions for the contributors.

The attestor shows the title from `ceremony.json` on the status page. It reads the title
at startup, so restart the attestor after you add the folder.

Contributors then run `./ceremony contribute <name>`. For a rehearsal without a folder:

```sh
./ceremony contribute --ceremony <ceremony-object-id> --network "$NETWORK"
```

A contributor gets the fees in one of two ways:

- **Funding link.** The contributor enters the private link in the CLI. The attestor
  then funds the address and, in a permissioned ceremony, adds it to the allowlist.
- **Own funds.** The contributor presses Enter at the funding question and funds the
  printed address. In a permissioned ceremony, the contributor sends you the address,
  and you add it to the allowlist.

```sh
# Print the private funding link. Give it only to contributors.
node coordinator/src/admin.js funding-url --run "$RUN" --network "$NETWORK"

# Add self-funded contributors to the allowlist, or remove addresses from it.
node coordinator/src/admin.js enroll-without-funding 0xA,0xB --run "$RUN" --network "$NETWORK"
node coordinator/src/admin.js remove-contributors 0xA --run "$RUN" --network "$NETWORK"

# Change the access mode. The allowlist stays, for a later change back.
node coordinator/src/admin.js set-access-mode permissionless --run "$RUN" --network "$NETWORK"
```

`set-access-mode` works during `Setup` and `Phase2Contribute`. It does not change the funding.
[Contributor funding](#contributor-funding) has the other funding commands.

### 7. End the contributions and seal

```sh
node coordinator/src/admin.js finalize-phase2 --run "$RUN" --network "$NETWORK"
node coordinator/src/admin.js seal --run "$RUN" --network "$NETWORK"
```

- `finalize-phase2` stops the contributions and draws the final beacon from the
  randomness of Sui. It is permanent. It fails while the chain is empty.
- `seal` applies the beacon, verifies the final files, uploads `final.p2c`, `final.zkey`
  and `final.vkey.json` to Walrus, and closes the ceremony. It needs the same genesis
  zkey and phase-1 file as the attestor.

### 8. Audit the closed ceremony

```sh
node coordinator/src/audit.js --run "$RUN" --network "$NETWORK"
```

The audit downloads the public files and checks them against the on-chain record:

1. The R1CS file and the phase-1 file give the committed identifiers.
2. Each accepted contribution gives the `contribution_hash` that is on-chain, in the same order.
3. The last entry is the final beacon with the on-chain value.
4. The final zkey passes the full verification against the R1CS file and the phase-1 file.
5. The published final parameters and verification key are equal to the derived ones.

### 9. Consider an immutable package

The organizer key holds the `UpgradeCap` of the Move package. An immutable package
removes the right to publish a new version.

- Do this only after the ceremony is closed and the audit passes. Before that, an
  immutable package blocks the correction of a contract bug.
- The step is permanent.
- All ceremonies on the same package lose the upgrade right together.
- The identifier is in `manifest.json` as `package_upgrade_capability`.

```sh
sui client call --package 0x2 --module package --function make_immutable \
  --args <UpgradeCap id>
```

## Contributor funding

The attestor can pay the fees of a contributor from the organizer wallet.

### How it works

1. `create.js` makes a random secret in `funding-secret.json`. Funding is on by default.
2. `admin.js funding-url` prints the private link, which contains the secret.
3. The contributor CLI first uses the funds that the address has. If they are not
   enough, it sends the address to `POST /fund/<secret>`.
4. The attestor sends SUI and WAL to the address. In a permissioned ceremony, the same
   transaction adds the address to the allowlist.
5. After acceptance, the CLI returns the leftover funds to the organizer. It does this
   only for an address that got an automatic payout. Other funds stay in the contribution
   address. The contributor moves them with `./ceremony refund`.

Automatic payouts are possible only during `Phase2Contribute`. An address gets one
automatic payout. A second request returns the first receipt.

**There is no spending limit.** Each person with the link can get one payout for each
new address. Keep in the wallet only the amount that you accept to lose, and replace
the link when it leaks.

### Amounts

`cli/src/funding-policy.js` has the amounts for each network. They fit the zkLogin v2
circuit, whose contribution file is about 120 MB. Change them for another circuit.

| Network | Payout | Minimum balance to contribute |
| --- | --- | --- |
| Testnet | 0.06 SUI and 0.30 WAL | 0.04 SUI and 0.15 WAL |
| Mainnet | 0.10 SUI and 6 WAL | 0.05 SUI and 3 WAL |

The WAL payout covers two uploads, so that a contributor can try again one time.
`admin.js cost` gives the current Walrus price for a file size.

Options of the attestor change the payout of the selected network:

```sh
node coordinator/src/attestor.js --run "$RUN" --network "$NETWORK" --port 8090 \
  --airdrop-sui 0.1 --airdrop-wal 0.4
```

- The amounts must not be less than the minimum balances.
- The change applies only to new payouts, and it needs a restart of the attestor.

### Commands

Each command takes `--run` and `--network`.

| Command | Effect |
| --- | --- |
| `admin.js funding-url` | Print the private link. It does not enable funding that is disabled. |
| `admin.js disable-funding` | Stop new automatic payouts. It cannot stop a transaction that is sent. |
| `admin.js enable-funding` | Start again with the same secret and payout history. |
| `admin.js rotate-funding-secret` | Replace the secret. The old link stops immediately. The payout history stays. |
| `admin.js enroll-without-funding 0x…` | Add addresses to the allowlist, with no payout. |
| `admin.js fund 0x… [--sui <amount>] [--wal <amount>]` | Send funds to one address by hand. It can be repeated, and it does not change the allowlist. Without amounts, it sends the payout of the network. An amount below the minimum balance is permitted. |

The attestor reads the funding configuration for each request. These commands need no restart.

### Payout history

`funding-payouts.jsonl` has one JSON record for each change of a payout. The attestor
writes the signed transaction before it sends it, and then the confirmed result.

- A payout with an unknown result keeps its signed transaction. The attestor sends the
  same transaction again. It replaces only a transaction that failed for certain.
- Never delete this file, also not to replace the secret or to disable funding.

### Wallet lock and recovery

The file `funding.lock` prevents two wallet operations at the same time. Coordinator
transactions, Walrus uploads, package publication, and manual funding all use it.

After a stop that was not clean:

1. Read the process ID in `funding.lock`. Make sure that this process is stopped.
2. If the lock contains `unresolved`, resolve that operation first:
   - A transaction entry has the digest and the signed bytes. Look up the transaction,
     or send the same bytes again.
   - An entry of an external tool needs a check of the transactions of that tool.
     Make sure that none is in progress. An error of an external tool keeps the lock,
     also when the error occurred before a transaction.
3. Remove only the lock file. Keep the payout history.
4. Start the attestor again.

An unresolved payout blocks each later wallet transaction, also after a restart. Send
the original payout request again to resolve it. The attestor ignores an incomplete
last line of the history. A complete line that is corrupt stops the funding.

### Secrets

- Git ignores the secret, the payout history, and the lock. Put the secret and the
  history in the private backup.
- Use HTTPS at the reverse proxy. Do not log the path `/fund/*`, also not in error logs.
- Only `funding-url` prints the link. The normal output does not have it.

## Status page and endpoints

The attestor HTTP server (`--port 8090`) has these public endpoints:

| Endpoint | Content |
| --- | --- |
| `GET /status` | The status page: phase, accepted count, slot and deadline, waiting count, the latest 20 contributions, and the attestor activity. It refreshes every 30 seconds. |
| `GET /status.json` | The data of the page. HTTP 200 for a healthy attestor, HTTP 503 during startup, after a loop failure, or when the activity is old. |
| `GET /queue?ceremonyId=<id>` | The number of contributors that wait, for example `{"waitingCount":5,"asOf":"2026-09-11T15:00:00.000Z"}`. |
| `POST /heartbeat`, `POST /telemetry` | The progress reports of a contributor CLI. |
| `POST /fund/<secret>` | A funding request. See [Contributor funding](#contributor-funding). |
| `POST /enroll-request` | A request to join the allowlist. The attestor only logs it. Approval stays manual. |

The reverse proxy answers `GET /healthz` itself, as its connection check.

These endpoints give public ceremony data and timestamps. They do not give the funding
link, the wallet state, raw error text, or logs.

### Health

- **The contributor CLI needs `/status.json`.** It reads the endpoint immediately before
  it claims or continues a slot. Without a healthy answer for the same ceremony and
  network, it stops before the claim, and the contributor can try again later. So a
  ceremony needs a public `--coordinator-url` and a running attestor.
- `/status.json` reports activity, not progress. A long download can also delay the answer.
- The attestor stays healthy for this time without new activity: 30 seconds or three poll
  intervals while it polls, two minutes for a download or a verdict transaction, and the
  verification time limit plus one minute for a verification. Use these values for alerts.
- A funding request comes before the health check of the CLI. So a payout can occur while
  the attestor is not healthy.
- A health check from a script:
  `curl --fail --show-error --max-time 10 https://<coordinator host>/status.json`

### Static files

Let the reverse proxy serve the page files, so that the page stays available when the
attestor is down. `coordinator/Caddyfile.example` has an example.

```sh
sudo install -d -m 755 /var/www/zkceremony-status
sudo install -m 644 coordinator/src/status_page.html coordinator/src/status_page.js /var/www/zkceremony-status/
# Put the /status and /status.js routes of the example into your Caddyfile.
# Keep /status.json and the other endpoints as a proxy to the attestor.
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo systemctl reload caddy
```

Put only these two files into the static folder.

### The waiting count

`waitingCount` is the number of different addresses that reported `waiting_for_slot`
in the last 90 seconds. A CLI reports that state every 30 seconds while it has funds,
can claim, and another contributor has the slot.

- It is a report from the clients. It is not an ordered queue and not a wait time.
- It resets when the attestor starts again.
- A count of zero does not show that the slot is free.
- It gives no contributor identity.

An approximate value of the wait is `waitingCount` times the slot duration.

## Slot duration

One contributor has the slot for a limited time, from the claim to the submission.
The verification by the attestor comes after the submission and is not in that time.

- `create.js --slot-duration-secs` sets it. The default is 900 seconds, and the
  maximum is 3600 seconds. The contract enforces the maximum.
- A submission at the exact deadline is valid. After the deadline, any person can
  open the slot again.
- A contributor who starts the CLI again continues the same claim with the same deadline.

The organizer can change the duration before the final beacon:

```sh
node coordinator/src/admin.js set-slot-duration --run "$RUN" --network "$NETWORK" \
  --slot-duration-secs 1200
```

The change applies only to later claims. A claim that is active keeps its deadline.

## Rehearsal

The mock runner does a complete small ceremony on testnet, from the creation to the audit.

```sh
cd coordinator
npm run mock:ceremony
```

It builds a very small circuit, so the Walrus uploads are small. Each run has its own
folder `ceremony-runs/mock-<timestamp>/` with the layout of a real ceremony, and a
folder `contributors/` with the key state and the receipt of each contributor.

| Variable | Effect |
| --- | --- |
| `CONTRIBUTOR_COUNT=3` | The number of contributors. They run one after the other. The default is 1. |
| `FUNDING_MODE=self-funded` | Manual allowlist and wait for funds. This is the default. |
| `FUNDING_MODE=automatic` | The private funding link. |
| `FUNDING_MODE=mixed` | Self-funded and automatic contributors in turn. |
| `PUBLISH_PACKAGE=auto`, `1`, `0` | Ask before a new package publication, allow it, or refuse it. |
| `ARTIFACT_MODE=existing` | Use existing files. Give `R1CS`, `PTAU`, `BASE_ZKEY` and `GENESIS`. |
