#!/usr/bin/env python3
from pathlib import Path

boot = Path("services/svc-identity/src/kyc/boot-vault.reachable.test.ts")
b = boot.read_text()
old_boot = """  it('router does not mount a document-bytes read on kyc', () => {
    expect(routerSrc).not.toMatch(/getDocument|readDocument|downloadDocument/);
    expect(routerSrc).not.toMatch(/vault\\.getFor|kycDocs\\.getFor/);
    expect(routerSrc).toContain('storeDocument');
    expect(routerSrc).toContain('listDocuments');
    expect(routerSrc).toContain('bindDocument');
  });
"""
new_boot = """  it('bytes read is compliance getDocument only — kyc.status stays meta', () => {
    expect(routerSrc).toMatch(/getDocument:\\s*scopedProcedure\\('admin:compliance'\\)/);
    expect(routerSrc).toContain('vault.getFor');
    expect(routerSrc).toContain('storeDocument');
    expect(routerSrc).toContain('listDocuments');
    expect(routerSrc).toContain('bindDocument');
    expect(routerSrc).not.toMatch(/readDocument|downloadDocument/);
  });
"""
if old_boot not in b:
    raise SystemExit("boot old block missing")
b = b.replace(old_boot, new_boot, 1)
b = b.replace(
    " * Does not invent a key. Does not mount a document-bytes read. Class X vendor\n * webhooks stay unwired.\n",
    " * Does not invent a key. Bytes read is compliance+MFA kyc.getDocument only.\n * Class X vendor webhooks stay unwired.\n",
    1,
)
boot.write_text(b)
print("patched boot-vault.reachable.test.ts")

rt = Path("services/svc-identity/src/router.test.ts")
r = rt.read_text()
old_rt = """describe('kyc surface never mounts a document-bytes read procedure', () => {
  it('router source has no getDocument / readDocument / decryptDocument on the wire path', () => {
    // router.test.ts lives next to router.ts
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'router.ts'), 'utf8');
    expect(src).not.toMatch(/getDocument|readDocument|downloadDocument/);
    // getFor may exist only if someone mistakenly mounts it — forbid mounting decrypt on kyc procedures.
    expect(src).not.toMatch(/vault\\.getFor|kycDocs\\.getFor|\\.getFor\\(/);
    expect(src).toContain('storeDocument');
    expect(src).toContain('listDocuments');
    expect(src).toContain('bindDocument');
  });
});
"""
new_rt = """describe('kyc.getDocument is compliance-only bytes, never a public/user read', () => {
  it('getDocument is mounted behind admin:compliance', () => {
    const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'router.ts'), 'utf8');
    expect(src).toMatch(/getDocument:\\s*scopedProcedure\\('admin:compliance'\\)/);
    expect(src).toContain('vault.getFor');
    expect(src).not.toMatch(/readDocument|downloadDocument/);
    expect(src).toContain('storeDocument');
    expect(src).toContain('listDocuments');
    expect(src).toContain('bindDocument');
  });

  it('a user session cannot open document bytes', async () => {
    const store = new MemoryKycDocumentStore(randomBytes(32).toString('base64'));
    const r = createIdentityRouter(stub.auth, stub.rank, { registrationOpen: true, kycDocs: store });
    const user = r.createCaller(await ctx(['identity:read', 'identity:write'], { userId: USER }));
    const err = await user.kyc
      .getDocument({ documentId: '55555555-5555-4555-8555-555555555555' })
      .catch((e: unknown) => e);
    expect(codeOf(err)).toBe('FORBIDDEN');
  });
});
"""
if old_rt not in r:
    raise SystemExit("router.test old block missing")
rt.write_text(r.replace(old_rt, new_rt, 1))
print("patched router.test.ts")
