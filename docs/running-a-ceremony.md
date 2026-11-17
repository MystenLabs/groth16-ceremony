# Running a ceremony

This document is for the organizer. It shows each step from a fresh clone to a closed
and audited ceremony. Contributors need only the instructions in their ceremony folder,
for example [zkLogin v2](../ceremonies/zklogin-v2/README.md).

This document gives the order of the steps, the permanent steps, and the recovery.
For each option of a command, read the comment at the top of its source file in
`coordinator/src/`.

## Run folder

Each ceremony has a name and one private folder, `ceremony-runs/<run>/`. Git ignores it.

- `manifest.json` is the record of the run: the identifiers, the commitments, and the
  transaction digests. The `Ceremony` object on Sui stays the authority for the current state.
- `state.json` has the organizer key. `funding-secret.json` has the funding secret.
- Use one run folder for all operations on a ceremony. Two copies cannot coordinate
  the wallet and the payouts.
- Never publish the folder as a whole. Put it in a private backup.

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
- **Public address.** The contributor CLI needs a healthy answer from `/status.json` of
  the attestor before it claims a slot. So the attestor needs a public HTTPS address.
  `coordinator/Caddyfile.example` has a reverse proxy configuration.

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

- `--permissioned [--allowlist 0xA,0xB]` makes a ceremony with an allowlist.
- Without `--auditors`, no person must approve the R1CS file. Use that only for a rehearsal.
- `--slot-duration-secs` sets the time limit of one turn. The default is 900 seconds,
  and the maximum is 3600.
- `create.js` uses the package in `move/Published.toml` if it is equal to the compiled
  `move/` folder. If not, it asks before it publishes a new package.

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
gives the funding and the status page.

```sh
node coordinator/src/attestor.js --run "$RUN" --network "$NETWORK" --port 8090
```

- A verification that stops or exceeds 10 minutes runs again. The third failure gives a reject.
- A local fault, for example a file that the attestor cannot read, gives no verdict.
  The slot stays pending, and the attestor tries again after 60 seconds. Read the log.
- Node.js 24 can print a `DEP0137` warning after a verification. It is not a failure.

### 6. Admit contributors

Add a folder `ceremonies/<name>/` for the ceremony and commit it. It has two files:

- `ceremony.json` with the title, the network, and the ceremony object ID.
- `README.md` with the instructions for the contributors.

Restart the attestor after you add the folder. It reads the title for the status page at startup.

Contributors then run `./ceremony contribute <name>`. A contributor gets the fees from
the private funding link, or funds the printed address. In a ceremony with an allowlist,
you add each self-funded address by hand.

```sh
# Print the private funding link. Give it only to contributors.
node coordinator/src/admin.js funding-url --run "$RUN" --network "$NETWORK"

# Add self-funded contributors to the allowlist, or remove addresses from it.
node coordinator/src/admin.js enroll-without-funding 0xA,0xB --run "$RUN" --network "$NETWORK"
node coordinator/src/admin.js remove-contributors 0xA --run "$RUN" --network "$NETWORK"

# Change the access mode. The allowlist stays, for a later change back.
node coordinator/src/admin.js set-access-mode permissionless --run "$RUN" --network "$NETWORK"

# Change the time limit of one turn. Active claims keep their deadline.
node coordinator/src/admin.js set-slot-duration --run "$RUN" --network "$NETWORK" \
  --slot-duration-secs 1200
```

### 7. End the contributions and seal

```sh
node coordinator/src/admin.js finalize-phase2 --run "$RUN" --network "$NETWORK"
node coordinator/src/admin.js seal --run "$RUN" --network "$NETWORK"
```

- **`finalize-phase2` is permanent.** It stops the contributions and draws the final
  beacon from the randomness of Sui. It fails while the chain is empty.
- `seal` applies the beacon, verifies the final files, uploads them to Walrus, and
  closes the ceremony.

### 8. Audit the closed ceremony

```sh
node coordinator/src/audit.js --run "$RUN" --network "$NETWORK"
```

The audit downloads the public files and checks the complete chain against the
on-chain record. It prints `audit OK` when each check passes.

The same command also works during the contributions. It then checks the accepted
contributions up to now and prints `audit OK so far`.
[Verify a ceremony](verify-a-ceremony.md) describes both cases for an external auditor.

### 9. Consider an immutable package

The organizer key holds the `UpgradeCap` of the Move package. An immutable package
removes the right to publish a new version.

- Do this only after the ceremony is closed and the audit passes. Before that, an
  immutable package blocks the correction of a contract bug.
- **The step is permanent.** All ceremonies on the same package lose the upgrade right together.
- The identifier is in `manifest.json` as `package_upgrade_capability`.

```sh
sui client call --package 0x2 --module package --function make_immutable \
  --args <UpgradeCap id>
```

## Contributor funding

The attestor can pay the fees of a contributor from the organizer wallet.

1. `create.js` makes a random secret. Funding is on by default.
2. The contributor CLI first uses the funds that the address has. If they are not
   enough, it sends the address to the attestor with the secret from the funding link.
3. The attestor sends SUI and WAL to the address. In a ceremony with an allowlist, the
   same transaction adds the address to the allowlist.
4. After acceptance, the CLI returns the leftover funds to the organizer. It does this
   only for an address that got an automatic payout.

**There is no spending limit.** Each person with the link can get one payout for each
new address. Keep in the wallet only the amount that you accept to lose, and replace
the link when it leaks.

`cli/src/funding-policy.js` has the payout amounts for each network. They fit the
zkLogin v2 circuit. Change them for another circuit.

Each command takes `--run` and `--network`, and needs no restart of the attestor.

| Command | Effect |
| --- | --- |
| `admin.js funding-url` | Print the private link. |
| `admin.js disable-funding` | Stop new automatic payouts. |
| `admin.js enable-funding` | Start again with the same secret. |
| `admin.js rotate-funding-secret` | Replace the secret. The old link stops immediately. |
| `admin.js fund 0x…` | Send funds to one address by hand. |

At the reverse proxy, do not log the path `/fund/*`, also not in error logs.

### Recovery after a stop that was not clean

`funding-payouts.jsonl` records each payout: the signed transaction before it is sent,
and then the result. **Never delete this file.** The file `funding.lock` prevents two
wallet operations at the same time.

1. Read the process ID in `funding.lock`. Make sure that this process is stopped.
2. If the lock contains `unresolved`, resolve that operation first:
   - A transaction entry has the digest and the signed bytes. Look up the transaction,
     or send the same bytes again.
   - An entry of an external tool needs a check of the transactions of that tool.
     Make sure that none is in progress.
3. Remove only the lock file. Keep the payout history.
4. Start the attestor again.

An unresolved payout blocks each later wallet transaction, also after a restart. Send
the original payout request again to resolve it.

## Rehearsal

The mock runner does a complete small ceremony on testnet, from the creation to the audit.

```sh
cd coordinator
npm run mock:ceremony
```

`bash scripts/mock-ceremony.sh --help` lists the variables, for example the number of
contributors and the funding mode.
