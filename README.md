# groth16-ceremony

This repository runs a Groth16 phase-2 trusted-setup ceremony. Sui records each step
of the ceremony, and Walrus stores each file. The code works for any Groth16 circuit.

## Ceremonies

| Ceremony | Network | State | Links |
| --- | --- | --- | --- |
| zkLogin v2 | Sui mainnet | Open for contributions | [Instructions](ceremonies/zklogin-v2/README.md) · [Status](https://zkceremony.sui.io/status) |

To contribute, you need an invitation from the organizer. Then you run one command:

```sh
git clone https://github.com/MystenLabs/groth16-ceremony.git
./groth16-ceremony/ceremony contribute zklogin-v2
```

The instructions of each ceremony give the details.

## How it works

1. **Setup.** The organizer creates a `Ceremony` object on Sui. The object commits the
   circuit (the R1CS file) and the phase-1 file. Phase 1 does not run here. Each ceremony
   adopts a public phase-1 file and names it in its instructions.
2. **Contributions.** One contributor has the slot at a time. The contributor downloads
   the current parameters from Walrus, adds a secret random value, uploads the result,
   and submits it on Sui.
3. **Verification.** The attestor verifies each submission off-chain. A valid submission
   becomes the new head of the chain. An invalid submission never changes the head.
4. **Final beacon.** The organizer ends the contributions. The contract draws a random
   value from Sui, and the organizer applies it as the last entry. The ceremony is then closed.
5. **Audit.** Any person can verify the complete chain of contributions from the on-chain
   record and the Walrus files.

## What you must trust

- **The result is secure if one contributor is honest.** An honest contributor uses a
  secret random value and does not keep it.
- **The attestor can delay the ceremony, but it cannot forge it.** The on-chain record
  and the Walrus files let any person repeat each check of the attestor.
- **The organizer selects the contributors** in a ceremony with an allowlist.

[The security model](docs/security-model.md) gives the full list.
[Verify a ceremony](docs/verify-a-ceremony.md) shows how to check the record yourself.

## Terms

| Term | Meaning |
| --- | --- |
| Organizer | The person who creates and operates the ceremony. The organizer holds the `OrganizerCap` object. |
| Attestor | The process of the organizer that verifies each submission and sends `accept` or `reject`. |
| Contributor | A person who adds a secret random value to the parameters. |
| Slot | The right to contribute. One contributor has it at a time, for a limited time. |
| Head | The latest accepted parameters. The next contributor starts from the head. |
| R1CS file | The compiled circuit. It defines what the final keys can prove. |
| Phase-1 file | The output of a powers-of-tau ceremony. It is the common start of each Groth16 setup. |
| Final beacon | A public random value that is the last entry of the chain. |

## Repository layout

| Path | Content |
| --- | --- |
| `ceremony` | The launcher of the contributor CLI. |
| `ceremonies/` | One folder for each ceremony: the instructions and `ceremony.json`, which names the network and the ceremony object. |
| `cli/` | The contributor CLI. |
| `move/` | The Sui Move module `groth16_phase2`: the `Ceremony` object, its phases, and the slot rules. |
| `coordinator/` | The organizer tools: ceremony creation, the genesis builder, the attestor, the admin commands, and the audit tool. |
| `bench/` | Benchmarks of the verification and of Walrus transfers. |
| `docs/` | The documents below. |
| `ceremony-runs/` | The private work folder of an organizer. Git ignores its content. |

The cryptographic operations come from [snarkjs](https://github.com/MystenLabs/snarkjs),
the MystenLabs fork, at a fixed commit.

## Documentation

| Document | Reader |
| --- | --- |
| [zkLogin v2 instructions](ceremonies/zklogin-v2/README.md) | Contributors to the zkLogin v2 ceremony |
| [The security model](docs/security-model.md) | Each person who wants to know what the ceremony guarantees |
| [Verify a ceremony](docs/verify-a-ceremony.md) | Auditors |
| [Cryptographic audit map](coordinator/src/crypto/README.md) | Reviewers of the cryptographic code |
| [Running a ceremony](docs/running-a-ceremony.md) | Organizers |
| [Automatic contributor funding](docs/funding.md) | Organizers |
| [Status page and monitoring](docs/status-and-monitoring.md) | Organizers and integrators |

## Tests

```sh
cd move && sui move test
cd cli && npm ci && node --test test/*.test.js
cd coordinator && npm ci && node --test test/*.test.js
```

CI runs these tests on each pull request.
