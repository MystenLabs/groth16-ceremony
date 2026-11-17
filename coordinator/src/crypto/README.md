# Cryptographic audit map

This document is for a reviewer of the cryptographic code. It names the files that hold
the cryptographic operations of the organizer tools, the rules that keep those operations
in one place, and the code outside this folder that a review must also follow.

The contributor CLI keeps its cryptographic operations in `cli/src/crypto.js`, and its
Walrus operations and storage rules in `cli/src/walrus.js`.

## Files

Start with `verify_contribution.js`, `seal.js`, and `audit.js`. They hold the protocol
decisions. Then follow their calls into the other files.

| File | Responsibility |
| --- | --- |
| `verify_contribution.js` | The verification sequence of one contribution, the check of the submitted hash, the accept or reject verdict, and the check that the base files belong to the ceremony |
| `seal.js` | The check of the beacon input, the construction of the final files, and their verification before release |
| `audit.js` | The checks of a closed ceremony: the commitments of the input files, the contribution history, the final beacon, the byte equality of the final parameters, and the equality of the verification key |
| `snarkjs.js` | The snarkjs adapter: genesis construction, conversion between compressed parameters and a full zkey, the head-extension check, the full verification, beacon application, verification-key export, and the metadata of contributions, circuit, and beacon |
| `walrus.js` | The Walrus SDK and CLI calls, local content identifiers, `SharedBlob` resolution, the certification and retention checks, the storage parameters, and upload, download, and cache handling |
| `commitments.js` | SHA-256 and BLAKE2b file hashes, and the validation of the phase-1 commitment |
| `identity.js` | Import and storage of the organizer secret key, the check of the active address, and transaction signing |
| `funding_secret.js` | Generation of the funding secret and its constant-time comparison |

## Boundaries

- `snarkjs.js` is the only production file of the organizer tools that imports snarkjs.
  This includes the internal parsers and the CLI entry point of snarkjs. Other modules
  call its functions and do not depend on snarkjs internals.
- `walrus.js` holds all Walrus SDK imports and CLI calls of the organizer tools. The
  content-identifier computation, the object identity checks, and the storage rules stay
  together with the operations that give their inputs.
- Genesis, seal, and audit share the conversion pipelines in `snarkjs.js`. They do not
  keep separate sequences for extract and compress, or for decompress and assemble.
- Genesis verification and the final audit share one R1CS verifier command.
- Callers do not inspect snarkjs error types, codes, or message text.

`test/crypto-boundary.test.js` guards these rules. It checks direct cryptographic imports
and key or random-number calls outside these files, the snarkjs and Walrus boundaries, and
the imports from `lib/`. It is a guard at source level. It is not a proof of complete isolation.
Test fixtures and benchmark code are outside this boundary.

## Hashes and helpers

- File hashing uses Node read streams with native SHA-256 and BLAKE2b-512.
- Transcript hashing uses the same native BLAKE2b-512 with the public-key serialization of snarkjs.
- The hash helpers and the phase-1 commitment helpers are asynchronous. A caller must await them.
- `lib/files.js` compares files with the standard `cmp -s` utility of macOS and Linux.
  The files in this folder decide which files must be equal. Exit status 1 means different
  bytes. A command failure or a file-access failure becomes an error.
- `lib/json.js` sorts object keys and formats JSON files in a reproducible way. `seal.js`
  uses those bytes for the published verification key. `audit.js` derives the expected key
  and requires that the published bytes are equal.
- The contributor CLI passes its SDK key pair directly to Walrus for signing.

## How a contribution is verified

1. `lib/verify_contribution.js` gets the files through the Walrus adapter and enforces
   the size limit of a submission.
2. It starts a child process, `lib/verify_worker.js`, with a time limit.
3. The child runs `crypto/verify_contribution.js`. This includes the transcript parsing
   and the comparison with the contribution hash that is pending on-chain.
4. The attestor submits only the resulting verdict. The verdict is bound to the head,
   the contributor, the file, and the hash that the attestor read.

The expected contribution hash is mandatory in the cryptographic sequence, also for
benchmark and test callers. No mode skips the comparison.

## Failure handling

| Event | Result |
| --- | --- |
| A cryptographic check fails | Reject |
| An operation inside the snarkjs wrapper throws an exception | Reject. This includes operational errors, so an infrastructure fault at this point can reject a valid contribution. The contributor can then submit again. |
| An error occurs outside the wrapper, for example a file that the attestor cannot read | No verdict. The slot stays pending, and the attestor tries the verification again. |
| The child process stops or exceeds its time limit | The verification runs again. The third failure gives a reject. |

The child measures its steps and sends one final result or error with the timings.
A stop or a timeout has no timings from the child. The parent still reports the
failure and keeps the timings of its own steps.

## Code outside this folder

A review must also follow these parts:

- `move/sources/groth16_phase2.move`: authorization, the phase transitions, the on-chain
  randomness, and the binding of an accept to the expected slot and head.
- `src/lib/verify_contribution.js` and `src/lib/verify_worker.js`: the resource limits,
  the supervision of the child, and the transfer of the complete verdict.
- The command and chain adapters: the selection of the inputs, the transaction contents,
  and the actions on a verification result. They also own the ceremony polling.
- The contributor state handling: secret-key storage, the random text input, and
  recovery after a stop.
- The dependencies: the MystenLabs snarkjs fork at a fixed commit with its internal file
  parsers, the Sui signing SDK, and the Walrus SDK and CLI. The files in this folder call
  those implementations. They do not implement cryptographic primitives again.

## Tests

- `test/seal.integration.test.js` runs the real contributor module through isolated
  verification, the beacon seal, and the final audit. It also changes commitments, hashes,
  beacon metadata, final parameters, and the verification key, and checks that the audit
  rejects each change.
- `test/verify-reject.test.js` covers malformed inputs, a child that runs out of memory,
  and the classification of infrastructure errors.
- `coordinator/scripts/mock-ceremony.sh` runs a live rehearsal. It also collects evidence
  from the transport and from the chain.
