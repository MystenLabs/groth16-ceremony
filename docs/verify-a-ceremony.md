# Verify a ceremony

This document is for an auditor. It shows how to check the record of a ceremony from
public data only. You do not need access to the machines of the organizer.

The examples use the zkLogin v2 ceremony on Sui mainnet. Its
[ceremony page](../ceremonies/zklogin-v2/README.md) has the identifiers and the hashes.

| Check | When | What you need |
| --- | --- | --- |
| [1. Read the on-chain record](#1-read-the-on-chain-record) | At each time | A Sui explorer |
| [2. Check the input files](#2-check-the-input-files) | At each time | The Walrus CLI |
| [3. Run the complete audit](#3-run-the-complete-audit) | After the ceremony is closed | This repository and a large machine |

## 1. Read the on-chain record

Open the ceremony object in a Sui explorer. For zkLogin v2, the object is
`0xed7a3922c4eb8c7efa4392b5918118ef73f865a362a54d1260c0cbbc83e6bb71` on Sui mainnet.

| Field | Meaning |
| --- | --- |
| `phase` | `Phase2Contribute` during the contributions, `Closed` at the end |
| `phase1_digest` | The BLAKE2b-512 hash of the phase-1 file |
| `r1cs_blob_id` | The Walrus object that holds the R1CS file |
| `chain` | The accepted contributions, in order |
| `head_blob_id` | The Walrus object of the latest accepted parameters |
| `final_beacon` | The final random value. It is empty before the end of the contributions. |

Each entry of `chain` has the contributor address, the name, the `contribution_hash`,
the Walrus object of the parameters, and the time.

An explorer shows byte values in base64. The ceremony documents use hexadecimal.
This command converts a base64 value:

```sh
echo '<base64 value>' | base64 -d | xxd -p -c 64
```

A contributor can compare the `contribution_hash` of their entry with the hash in
their receipt file.

## 2. Check the input files

The R1CS file and the phase-1 file decide what the final keys can prove. These checks
show that the files on your disk are the files that the ceremony committed.

Install the Walrus CLI and configure it for the network of the ceremony.

```sh
# Download the R1CS file. The ceremony page gives its Walrus blob id.
walrus read <R1CS blob id> --out circuit.r1cs

# Compare these values with the ceremony page.
sha256sum circuit.r1cs
b2sum circuit.r1cs

# The result must be equal to the R1CS blob id.
walrus blob-id circuit.r1cs
```

Get the phase-1 file from the address on the ceremony page. Then:

```sh
# The result must be equal to the `phase1_digest` field of the ceremony object.
b2sum <phase-1 file>
```

The ceremony page also says how the phase-1 file comes from its public source.

## 3. Run the complete audit

After the organizer closes the ceremony, one command checks the complete record.

You need:

- Node.js 24, Git, and the Walrus CLI.
- The phase-1 file from check 2. The audit downloads the R1CS file itself.
- A machine with enough memory and 15 GB of free disk space.

```sh
git clone https://github.com/MystenLabs/groth16-ceremony.git
cd groth16-ceremony
npm --prefix coordinator ci

node coordinator/src/audit.js <ceremony object id> --network mainnet \
  --ptau <phase-1 file> --workdir audit-work
```

The audit does these checks:

1. The R1CS file from Walrus gives the Walrus identifier that is on-chain.
2. The phase-1 file gives the `phase1_digest` that is on-chain.
3. Each accepted contribution can be downloaded, and its file gives the
   `contribution_hash` that is on-chain.
4. The transcript of the final key has the same contributions in the same order as the chain.
5. The last entry is the final beacon, and it uses the `final_beacon` value that is on-chain.
6. The final key passes the full snarkjs verification against the R1CS file and the phase-1 file.
7. The final parameters and the verification key that the organizer published are
   equal to the ones that the audit derives.

The audit prints `audit OK` when each check passes. It stops at the first check that fails.

## What these checks do not show

- Circuit authenticity is assumed in this process. The checks show that the keys belong
  to the committed R1CS file. They do not examine the circuit.
- They do not show that a contributor was honest. The result is secure if one contributor
  in the accepted chain is honest.
