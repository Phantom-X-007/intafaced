from pathlib import Path

p = Path('services/svc-trade/src/spot/trade-service.ts')
s = p.read_text()
a = s.replace('});      await this.notifyAffiliatePayout', '});\n      await this.notifyAffiliatePayout')
a = a.replace('});    await this.notifyAffiliatePayout', '});\n    await this.notifyAffiliatePayout')
if a == s:
    raise SystemExit('no jammed payout calls found')
p.write_text(a)
print('wrapped payout calls')
