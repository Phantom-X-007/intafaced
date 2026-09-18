# P0 Sepolia STATUS (compact ledger)

**Plan:** [`P0-SEPOLIA-PLAN.md`](P0-SEPOLIA-PLAN.md)  
**Spec:** [`docs/PROTOCOL-P0-FULL-SPEC-2026-09-18.md`](../../PROTOCOL-P0-FULL-SPEC-2026-09-18.md)

| Task                      | PR                                                            | State                                           |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------------- |
| T1 venue 6-dec            | [#4289](https://github.com/Phantom-X-007/intafaced/pull/4289) | merged                                          |
| T2 deploy + registry      | [#4292](https://github.com/Phantom-X-007/intafaced/pull/4292) | merged                                          |
| T3 labels + explorer URLs | [#4292](https://github.com/Phantom-X-007/intafaced/pull/4292) | `verified:false` (no Basescan API). skip-honest |
| T4 indexer honesty        | [#4291](https://github.com/Phantom-X-007/intafaced/pull/4291) | merged. Env example this PR                     |
| T5 journeys               | on-chain                                                      | **done** — venue/AMM/SA/CREATE2/escrow          |
| T6 lending                | —                                                             | refuse-closed residual (not deployed)           |
| T7 skip-honest            | this file                                                     | named                                           |

**Must journeys (84532, not INTACHAIN, audited:false)**

| Needle                       | Proof                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registry                     | `services/svc-protocol/deployments/base-sepolia.json`                                                                                                                                                                                                                                                                     |
| Venue                        | https://sepolia.basescan.org/address/0x78fbe21605d9424efdd6b2fddc4e846e8c746a4b                                                                                                                                                                                                                                           |
| Deposit TEST + place         | https://sepolia.basescan.org/tx/0x8a1f686d305b97c450f7cb051c97b17d38b031144d02a66f9e813188d0208d1b                                                                                                                                                                                                                        |
| Cancel                       | https://sepolia.basescan.org/tx/0x88be20b4899d242c507f476f655bb042d5fcbaf1b10fc37f6ba29ed0d9c7adf7                                                                                                                                                                                                                        |
| Withdraw TEST                | https://sepolia.basescan.org/tx/0x99eaefd77817fd3f8515b725a8acd7de7feb2d802ca8bde8529962c1d18e08a2                                                                                                                                                                                                                        |
| Deposit 1 USDC (6-dec scale) | https://sepolia.basescan.org/tx/0xfe39267e43fdd0e6a7aa0a26f4056136467268378014665ec4470eddfb0c4e6e                                                                                                                                                                                                                        |
| Smart account CREATE         | https://sepolia.basescan.org/address/0xfb4f4D2385C3291E2601bf36d8c1Dc1c930f08E0 tx https://sepolia.basescan.org/tx/0x1cfc08f774bf03d1870785f6ecb8708133c7c473f97d2f859c15b2a3fa2ea816                                                                                                                                     |
| TokenFactory CREATE2 P0P     | https://sepolia.basescan.org/tx/0x6a529563d44a188f6dd3c819c3fa44f0b8f0a57bf1c0f60972e879e4d2d09caa                                                                                                                                                                                                                        |
| AMM mint                     | https://sepolia.basescan.org/tx/0x748b646e9faa21ec96556a9b18ed80abf7e6ed780b438cff5a1b26e00b921c37                                                                                                                                                                                                                        |
| AMM swapExactIn              | https://sepolia.basescan.org/tx/0xc25049a8dfb659de14dfa3b946ad2fb92603764d22da727a6b27546ce397b1c8                                                                                                                                                                                                                        |
| Pool                         | https://sepolia.basescan.org/address/0x19F9639830DC27093Ff34f7E01Da8a26f1aE3D28                                                                                                                                                                                                                                           |
| SA execute                   | https://sepolia.basescan.org/tx/0x21bd7e83ff7e284b9fe5de33123628f7ffa5eee742fad0fdf5c9a433f811e05d                                                                                                                                                                                                                        |
| Escrow open/lock/release     | https://sepolia.basescan.org/tx/0x785d137d4c3c1059daa879e8ed47af9240aed061f5d2ccfb229720af49999e1a · lock https://sepolia.basescan.org/tx/0x05a122a78d376d409608cb8494a731991315543d162a4686650689b28fc50a54 · release https://sepolia.basescan.org/tx/0x9fe16d0cb8978caa7cde5394d8aa270dd1bc73548ddc51584d27446e235d9f5f |

Indexer: `services/svc-indexer/sepolia.env.example` — do not bake the address into compose default (anvil stays blank).

**Skip-honest (not this wave / Class X):** passkey · recovery · launch trust/NFT/RWA content · merchant · stealth scan · crew/legacy · treasury yield · rank · CardPull issuer · paymaster float · Basescan source verify (Sourcify match null, no API key) · lending market · Vue · INTACHAIN.

**Wave A agent work:** complete. No human blocker remaining.

**Never:** Arc 5042 · `audited:true` · IFC token.
