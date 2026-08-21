# D26-P1-O2 — pay affiliate accrue caller

**Lane:** `denon-d26-p1-o2-pay-accrue`  
**Tracker:** `ops.affiliates`  
**Goal:** After `merchantSettlement` posts house pay fees, best-effort identity accrue (`sourceModule: pay`).  
**Done-bar:** 412/down never unwind settlement; zero fees skipped; compose `IDENTITY_URL` pass-through; no invent rates.

Do not: dual-edit svc-identity / svc-trade · invent PSP · Vue.
