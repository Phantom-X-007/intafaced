#!/usr/bin/env python3
"""One-shot: requireKey before reader on getFor, and mount kyc.getDocument. Not a router split."""
from pathlib import Path

store = Path("services/svc-identity/src/kyc/document-store.ts")
ss = store.read_text()
old = """  async getFor(id: string, reader: DocReader): Promise<{ meta: StoredDocumentMeta; bytes: Buffer }> {
    assertReader(reader);
    const key = this.requireKey();
"""
new = """  async getFor(id: string, reader: DocReader): Promise<{ meta: StoredDocumentMeta; bytes: Buffer }> {
    // Refuse before reader or row — no invented key, no plaintext.
    const key = this.requireKey();
    assertReader(reader);
"""
n = ss.count(old)
if n == 2:
    ss = ss.replace(old, new)
    store.write_text(ss)
    print("patched document-store getFor", n)
elif "Refuse before reader or row" in ss:
    print("document-store already patched")
else:
    raise SystemExit(f"document-store getFor openers: {n}")

p = Path("services/svc-identity/src/router.ts")
s = p.read_text()
if "getDocument:" in s:
    print("getDocument already mounted")
else:
    needle = """      /**
       * Meta-only list for one subject. No document bytes on the wire.
       * Compliance scope only — not a free userId lookup for ordinary sessions.
       */
      listDocuments:"""
    if needle not in s:
        raise SystemExit("listDocuments needle missing")
    insert = """      /**
       * §10 — operator opens a KYC document from the encrypted vault.
       *
       * MFA required: same privilege class as store/approve (document = PII).
       * Refuses a blank IDENTITY_KYC_DOC_KEY before reader — no invented AES key, no plaintext.
       */
      getDocument: scopedProcedure('admin:compliance')
        .input(z.object({ documentId: z.string().uuid() }))
        .output(kycDocMetaOutput.extend({ bytesBase64: z.string() }))
        .mutation(async ({ ctx, input }) => {
          try {
            requireMfa(ctx.principal);
            const vault = requireKycDocs();
            const opened = await vault.getFor(input.documentId, {
              kind: 'compliance',
              operatorId: ctx.principal.userId,
            });
            return { ...presentDocMeta(opened.meta), bytesBase64: opened.bytes.toString('base64') };
          } catch (err) {
            throw toTrpcError(err);
          }
        }),

"""
    out = s.replace(needle, insert + needle, 1)
    if "getDocument:" not in out:
        raise SystemExit("getDocument insert failed")
    p.write_text(out)
    print("mounted kyc.getDocument")
