#!/usr/bin/env python3
from pathlib import Path
p = Path("services/svc-identity/src/kyc/document-store.ts")
s = p.read_text()
old = """  async getFor(id: string, reader: DocReader): Promise<{ meta: StoredDocumentMeta; bytes: Buffer }> {
    assertReader(reader);
    const key = this.requireKey();
"""
new = """  async getFor(id: string, reader: DocReader): Promise<{ meta: StoredDocumentMeta; bytes: Buffer }> {
    // Refuse before reader or row — no invented key, no plaintext.
    const key = this.requireKey();
    assertReader(reader);
"""
n = s.count(old)
if n != 2:
    raise SystemExit(f"expected 2 getFor openers, got {n}")
p.write_text(s.replace(old, new))
print("patched", n)
