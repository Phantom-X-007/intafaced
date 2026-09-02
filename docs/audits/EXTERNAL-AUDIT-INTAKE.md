# External audit intake (Nitro budget → `audited:true`)

**Owner:** Nitro funds the firm · **Engineering:** `@shehzad002` maintains the pipeline.

`audited:true` is a sale/UI flag. The only code path that sets it is
`services/svc-protocol/src/audit/pipeline.ts` when:

1. `kind` is `external` (never `internal`),
2. `signedBy` names the firm,
3. `expectedHash` is pinned and matches the report file bytes.

Internal threat models, green CI, and forge fuzz **cannot** flip the flag.

---

## Steps when a firm finishes

1. Commit the report under `docs/audits/external/` (PDF is fine; markdown preferred for hashing).
2. Compute the package hash (CRLF-normalised):

   ```bash
   node -e "
   const { createHash } = require('node:crypto');
   const fs = require('node:fs');
   const body = fs.readFileSync('docs/audits/external/<report>.md','utf8').replace(/\r\n/g,'\n');
   console.log('0x'+createHash('sha256').update(body,'utf8').digest('hex'));
   "
   ```

3. Add a row to `docs/audits/external-claims.json`:

   ```json
   {
     "claims": [
       {
         "id": "protocol-smart-accounts",
         "packagePath": "docs/audits/external/smart-accounts-openzeppelin-2026.md",
         "kind": "external",
         "signedBy": "OpenZeppelin",
         "signedAt": "2026-10-01T00:00:00.000Z",
         "expectedHash": "0x<sha256 from step 2>"
       }
     ]
   }
   ```

4. Run `pnpm --filter @intafaced/svc-protocol test` — registry tests must pass.
5. `protocol.auditRegistry` must show `audited: true` for that id only.
6. Update tracker `socket.contract-audit` when the scoped review is complete.

Do **not** hand-edit `audited: true` in product UI or tracker prose without the JSON row.
