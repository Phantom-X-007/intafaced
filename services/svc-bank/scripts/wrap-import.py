from pathlib import Path

p = Path("services/svc-bank/src/ramps/ramps.test.ts")
text = p.read_text()
old = (
    "import { assertOnlyWithdrawDestinations, memoryWithdrawDestinations } "
    "from '../withdraw-destination.js';\n"
)
new = (
    "import {\n"
    "  assertOnlyWithdrawDestinations,\n"
    "  memoryWithdrawDestinations,\n"
    "} from '../withdraw-destination.js';\n"
)
if old not in text:
    raise SystemExit("needle missing")
p.write_text(text.replace(old, new, 1))
print("wrapped")
