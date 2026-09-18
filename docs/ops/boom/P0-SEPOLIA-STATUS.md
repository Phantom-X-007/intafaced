# P0 Sepolia STATUS — full suite except own L1

**84532. Not INTACHAIN. `audited:false`.** Registry: `services/svc-protocol/deployments/base-sepolia.json`

## Rooms on-chain (all spec 1–25 except sockets/parked)

| Room                       | Address / proof                                                                                                                                |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Venue + TEST/USDC journeys | [0x78fb…](https://sepolia.basescan.org/address/0x78fbe21605d9424efdd6b2fddc4e846e8c746a4b)                                                     |
| AMM pool mint/swap         | [0x19F9…](https://sepolia.basescan.org/address/0x19F9639830DC27093Ff34f7E01Da8a26f1aE3D28)                                                     |
| Router quoteExactIn        | [0x8d28…](https://sepolia.basescan.org/address/0x8d28045bbe8a1aed986751257c5711524a7ec73f) quoted 1 USDC → ~0.595 TEST                         |
| SA + execute               | [0xfb4f…](https://sepolia.basescan.org/address/0xfb4f4D2385C3291E2601bf36d8c1Dc1c930f08E0)                                                     |
| PasskeyOwner (P-256 G)     | [0x8e6c…](https://sepolia.basescan.org/address/0x8e6c9bca18fda27d4742cabfaa12312f4e5f461c) — RIP-7212 live-verify residual                     |
| Recovery + guardian        | [tx](https://sepolia.basescan.org/tx/0x0d9ce8f84a89b01c4125cc102ae6eff8ea5074fd64f3e668479ad18360ea4abb)                                       |
| Escrow round-trip          | lock/release on [0xc8ab…](https://sepolia.basescan.org/address/0xc8ab604a513ec25752fed1a3f0037bec208e7384)                                     |
| TokenFactory CREATE2       | P0P live                                                                                                                                       |
| FairLaunch                 | [0xbc52…](https://sepolia.basescan.org/address/0xbc5227e71f456e3910ba7b5382054c8f1b2bfaf3)                                                     |
| MemeLaunch                 | [0x211a…](https://sepolia.basescan.org/address/0x211ab60691cb309505f6ce3c1761ad362d05506a)                                                     |
| LP lock 1 TEST             | [tx](https://sepolia.basescan.org/tx/0x902c726de4946000b40b3e0b62f169dca0ad7dd5c0cdd1edd7b98fac5832ec34)                                       |
| NFT mint                   | [tx](https://sepolia.basescan.org/tx/0x12f869e14500cf2b6c67b16c36d26bd6b7adbeac1ba4fdab94a4fcbe9c0a2c46)                                       |
| RoyaltyMarket              | [0xb53c…](https://sepolia.basescan.org/address/0xb53c0ad55ef393a5d768b9e595319ed5f60233d3)                                                     |
| RWA register               | **LicenceUnset** revert (zero hash) — refuse-closed                                                                                            |
| Merchant pay               | [tx](https://sepolia.basescan.org/tx/0xa07269ef1e91e2f2d43d48ae5e9bc1de804f131fb99eb1256579983abd3b9b17)                                       |
| Stealth announce           | [tx](https://sepolia.basescan.org/tx/0xb2d388c967c3dabb3612a4ba3931e821a3654ebdf14042e8e17a4fa02fe98ccf)                                       |
| CrewVault                  | [0xcbf5…](https://sepolia.basescan.org/address/0xcbf56214139bf9698ba7f2b1231f1f87f86b0903)                                                     |
| LegacyVault                | [0xc5ab…](https://sepolia.basescan.org/address/0xc5abd1ec4bec16f2066e47042cf8482e4694b31f)                                                     |
| Treasury deposit           | **LicenceUnset** revert                                                                                                                        |
| Rank attest                | [tx](https://sepolia.basescan.org/tx/0x864c4c1c060b170e1355ea35ecad5199f8c5414ee738589dd900b8784a984005)                                       |
| Oracle + lending           | [market](https://sepolia.basescan.org/address/0x7abcf6cdb6bdf481c318562a075369160c575e7d) borrow reverts InsufficientLiquidity (no marks/cash) |
| Paymaster                  | unfunded refuse                                                                                                                                |

**Skip:** LaunchVesting (constructor pull needs predicted allowance — residual). RIP-7212 passkey _verify_. Basescan source-verify. Vue. Own L1. IFC. Predict. Live issuer. Mainnet. `audited:true`.

**Indexer:** `services/svc-indexer/sepolia.env.example` — compose default stays blank.

**Never:** Arc 5042 · INTACHAIN stamp · IFC token.
