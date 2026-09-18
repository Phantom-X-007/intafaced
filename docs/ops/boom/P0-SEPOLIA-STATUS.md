# P0 Sepolia STATUS (compact ledger)

**Plan:** [`P0-SEPOLIA-PLAN.md`](P0-SEPOLIA-PLAN.md)  
**Spec:** [`docs/PROTOCOL-P0-FULL-SPEC-2026-09-18.md`](../../PROTOCOL-P0-FULL-SPEC-2026-09-18.md)  
**Do not** recover from chat memory.

| Task                         | PR                                                            | State                                                                                                              |
| ---------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| T1 venue 6-dec scale         | [#4289](https://github.com/Phantom-X-007/intafaced/pull/4289) | merged                                                                                                             |
| T2 deploy-sepolia + registry | this PR                                                       | **broadcast** 84532. Registry `deployments/base-sepolia.json`                                                      |
| T3 explorer verify + labels  | this PR                                                       | explorer URLs in registry. `verified: false` until Basescan API. Labels: testnet / not INTACHAIN / `audited:false` |
| T4 indexer honesty           | [#4291](https://github.com/Phantom-X-007/intafaced/pull/4291) | code merged. Point `INDEXER_VENUE_ADDRESS=0x78fbe21605d9424efdd6b2fddc4e846e8c746a4b`                              |
| T5 sepolia-journey           | this PR                                                       | deposit + resting ask on-chain. USDC quote path skipped (balance 0)                                                |
| T6 lending refuse-closed     | —                                                             | not deployed (no invented LTV/oracle). Residual                                                                    |
| T7 skip-honest named         | this PR                                                       | below                                                                                                              |

**Published (Base Sepolia 84532, not INTACHAIN, audited:false):**

| Name            | Explorer                                                                        |
| --------------- | ------------------------------------------------------------------------------- |
| SovereignVenue  | https://sepolia.basescan.org/address/0x78fbe21605d9424efdd6b2fddc4e846e8c746a4b |
| TEST token      | https://sepolia.basescan.org/address/0x780627a9d781edf08bd81fbf2263fa85dd8c135e |
| AccountFactory  | https://sepolia.basescan.org/address/0x6573a525de6c7428a8b1c07fb5986d789f7694f4 |
| TokenFactory    | https://sepolia.basescan.org/address/0x2df184ca3191285b772b6f65bb310ff8117bf5fd |
| PoolFactory     | https://sepolia.basescan.org/address/0x0ddaf1c1d7b3cabb38b083052e73d4285dce8611 |
| ScopedPaymaster | https://sepolia.basescan.org/address/0xa5b27bcd2b1a5c0335d5929cac9a093a238ec7d6 |
| SovereignEscrow | https://sepolia.basescan.org/address/0xc8ab604a513ec25752fed1a3f0037bec208e7384 |

**On-chain proof:** quoteToken = Circle USDC `0x036CbD53842c5426634e7929541eC2318f3dCF7e`. `takerFeeBps=0`. Deposit 1e18 TEST + place ask: tx `0x8a1f686d305b97c450f7cb051c97b17d38b031144d02a66f9e813188d0208d1b`.

**Skip-honest:** passkey · recovery · AMM mint/swap (needs USDC) · USDC deposit · launch trust/NFT/RWA content · merchant · stealth scan · crew/legacy · treasury yield · rank · CardPull issuer · paymaster float · Basescan source verify (no API key) · lending market.

**Never:** Arc 5042 · INTACHAIN stamp · `audited:true` · IFC token.
