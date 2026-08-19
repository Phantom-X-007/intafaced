#!/usr/bin/env python3
from pathlib import Path

p = Path('services/svc-identity/src/router.test.ts')
s = p.read_text()
old = """    const err = await user.kyc
      .getDocument({ documentId: '55555555-5555-4555-8555-555555555555' })
      .catch((e: unknown) => e);
"""
new = "    const err = await user.kyc.getDocument({ documentId: '55555555-5555-4555-8555-555555555555' }).catch((e: unknown) => e);\n"
if old not in s:
    raise SystemExit('prettier needle missing')
p.write_text(s.replace(old, new, 1))
print('prettier-collapsed getDocument caller')
