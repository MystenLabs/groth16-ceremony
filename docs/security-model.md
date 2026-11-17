# The security model

This document states what a ceremony guarantees, what each party can do, and what
protects against each misuse. It is for each person who wants to rely on the result.

## The main guarantee

A Groth16 setup makes a proving key and a verification key. The setup uses secret
random values. A person who knows all of them can make false proofs.

In a ceremony, each contributor adds one secret random value. The result is secure if
**one contributor in the accepted chain is honest**. An honest contributor uses a random value that no other
person knows, and does not keep it.

The guarantee does not need trust in the organizer, the attestor, Sui, or Walrus.
A person who does the checks in [Verify a ceremony](verify-a-ceremony.md) gets the
guarantee from the mathematics.

## What the ceremony does not guarantee

- **It does not show that the circuit is correct.** The ceremony binds the keys to one
  R1CS file. A fault in the circuit stays a fault in the keys. Each ceremony page gives
  the hashes of its R1CS file.
- **It does not replace phase 1.** Each ceremony adopts a public phase-1 file. Phase 1
  has the same rule: it is secure if one of its contributors is honest. Each ceremony
  page names its phase-1 file and the number of its contributions.

## What the chain records

The `Ceremony` object on Sui holds the complete public record:

- The Walrus object of the R1CS file, and the BLAKE2b-512 hash of the phase-1 file.
- Each accepted contribution, in order: the contributor address, the name, the
  contribution hash, the Walrus object of the parameters, and the time.
- The final beacon value, and the Walrus objects of the final keys.

The contract has no function that changes or removes an accepted contribution.

## What each party can and cannot do

### A contributor

| Can do | Protection |
| --- | --- |
| Submit invalid parameters | The attestor verifies each submission against the current head. An invalid submission gets `reject`, and the head does not change. |
| Hold the slot and submit nothing | A turn has a time limit, at most one hour. After the limit, any person can open the slot again. |
| Use a random value that is not secret | The result stays secure if one other contributor is honest. |

A contributor cannot change the contribution of another person, and cannot change
the order of the chain.

### The organizer and the attestor

One key controls both roles. It holds the `OrganizerCap` object of the ceremony.

| Can do | Protection |
| --- | --- |
| Refuse a valid submission, or stop the attestor | No cryptographic protection. This delays the ceremony. It does not make the result insecure. |
| Select the contributors, in a ceremony with an allowlist | The allowlist and each contributor address are public on-chain. |
| Accept an invalid submission | The contract trusts the `accept` of the organizer. The audit finds this fault: it verifies the complete chain from the public files. |
| End the contributions at a time of its choice | The contract refuses the end while the chain is empty. |
| Publish a new version of the Move package | The organizer key holds the upgrade right of the package. A new version can add functions. After the ceremony, the organizer can make the package immutable, which removes this right. |

The organizer cannot select the final beacon. The contract draws it from the
randomness of Sui in the same transaction that stops the contributions. The audit
checks that the last entry of the chain uses this value.

The organizer cannot remove the security that an honest contributor gave. Each later
entry, the final beacon included, only adds to the earlier ones.

### Sui and Walrus

| Risk | Protection |
| --- | --- |
| A Walrus file changes | A Walrus identifier is a function of the content. Each tool computes it again after a download. |
| A Walrus file is lost | Each ceremony file is stored as a permanent object for at least 50 storage periods. Any person can pay to extend it. Without the files, the on-chain record stays, but a new audit is not possible. |
| The randomness of Sui is predictable | The final beacon is then predictable. The result stays secure if one contributor is honest. The beacon is an additional protection, not the main one. |

## How the attestor verifies a submission

For each submission, the attestor does these checks. Any person can repeat them.

1. The Walrus object is shared, certified, permanent, and stored long enough.
2. The file is not larger than the size limit.
3. The parameters extend the current head: the fixed parts are equal, and only the
   parts that a contribution changes are different.
4. The transcript in the file has one new entry, and its hash is equal to the
   contribution hash that the contributor submitted on-chain.
5. The complete key, assembled from the parameters, passes the full snarkjs
   verification against the R1CS file and the phase-1 file.

[The cryptographic audit map](../coordinator/src/crypto/README.md) names the code for each check.

## The contributor machine

- The secret random value exists only in memory during the computation. The CLI does
  not write it to a file or to the log.
- The CLI mixes the text that the contributor types with randomness from the operating system.
- The CLI makes a new Sui key for each contribution. The key only pays the fees. It is
  not a secret of the ceremony.

A contributor who wants more protection can use a machine that is dedicated to this task.

## The funding link

In a ceremony with automatic funding, the organizer gives each contributor one private
link. The link lets the holder ask for the fees of one contribution, one time for each
address. It gives no other right. A person with the link cannot change the ceremony
record. The organizer can replace the link at each time.
