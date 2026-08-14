from pathlib import Path

FILES = [
    Path('services/svc-bank/src/db/schema.ts'),
    Path('services/svc-bank/src/ramps/ramps.test.ts'),
]

for path in FILES:
    text = path.read_text()
    while '\n\n\n' in text:
        text = text.replace('\n\n\n', '\n\n')
    path.write_text(text)

Path('services/svc-bank/scripts/format-withdraw-dest.py').unlink(missing_ok=True)
Path('.github/workflows/format-withdraw-dest-once.yml').unlink(missing_ok=True)
