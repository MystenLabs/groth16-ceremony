# Verify a ceremony

One command checks the record of a ceremony from public data only. It works during the
ceremony and after its end. You do not need access to the machines of the organizer.

```sh
git clone https://github.com/MystenLabs/groth16-ceremony.git
cd groth16-ceremony
npm --prefix coordinator ci

node coordinator/src/audit.js zklogin-v2
```

You need Node.js 24, Git, the Walrus CLI, and 15 GB of free disk space. The name is a
folder of [`ceremonies/`](../ceremonies/). Its `ceremony.json` gives the network, the
ceremony object ID, and the Walrus blob ID of the phase-1 file. The audit downloads each
file from Walrus. If you have the phase-1 file already, give it with `--ptau <file>`.

## What the audit checks

1. The R1CS file from Walrus and the phase-1 file are the files that the ceremony
   committed on-chain.
2. Each accepted contribution can be downloaded, and its file gives the
   `contribution_hash` that is on-chain, in the same order.
3. The latest parameters come from the R1CS file and the phase-1 file through each
   accepted contribution. The audit verifies the proof of each contribution.
4. After the ceremony is closed: the last entry is the final beacon with the on-chain
   value, and the final keys that the organizer published are equal to the derived ones.

The audit prints `audit OK so far` during the ceremony, and `audit OK` after its end.
It stops at the first check that fails and prints the reason.

During the ceremony, the first audit builds the start parameters, which is the longest
step. A later audit uses them again.

## What the audit does not show

- Circuit authenticity is assumed in this process. The audit shows that the keys belong
  to the committed R1CS file. It does not examine the circuit.
- It does not show that a contributor was honest. The result is secure if one
  contributor in the accepted chain is honest.
