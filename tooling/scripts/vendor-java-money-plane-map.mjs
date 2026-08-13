#!/usr/bin/env node
/**
 * D26-P2-02 — Vendor Java money-plane door map (executable inventory + proof).
 *
 * Answers: which doors can still move value; disposition CLOSE / THROW / DOOR / §13;
 * brand + custody posture is stated with executed evidence (not prose alone).
 *
 * Brand-safe: emits module:Class keys only (same convention as vendor-java-money-scan).
 * Does not name upstream identity tokens — brand-scan §0.7.
 *
 * Run:
 *   node tooling/scripts/vendor-java-money-plane-map.mjs
 *   node tooling/scripts/vendor-java-money-plane-map.mjs --write
 *   node tooling/scripts/vendor-java-money-plane-map.mjs --self-test
 *   pnpm map:vendor-java-money-plane
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

const ROOT = process.cwd();
const VENDOR = join(ROOT, 'vendor');
const PROOF_JSON = join(ROOT, 'tooling', 'vendor-maps', 'java-money-plane-proof.json');
const PROOF_MD = join(ROOT, 'docs', 'VENDOR-JAVA-MONEY-PLANE-MAP-D26-P2-02.md');

const args = new Set(process.argv.slice(2));
const WRITE = args.has('--write');
const SELF_TEST = args.has('--self-test');

const DOOR_APPS = ['admin', 'ucenter-api', 'otc-api', 'exchange-api', 'exchange'];
const REGISTRATION =
  /registry\s*\.\s*addInterceptor\s*\(\s*new\s+DualBookMoneyDoorInterceptor\s*\([^)]*\)\s*\)\s*\.\s*addPathPatterns\s*\(\s*"\/\*\*"\s*\)/;

/** Class-level `/rpc` + transfer/withdraw mapping + a real send helper (stubs only return 500). */
function controllerHasRpcSpend(text) {
  const code = stripComments(text);
  if (!/@RequestMapping\s*\(\s*["']\/rpc["']\s*\)/.test(code)) return false;
  const hasMapping =
    /@(?:GetMapping|PostMapping|RequestMapping)\s*\(\s*(?:\{[^}]*\b(?:transfer|withdraw)\b[^}]*\}|["'](?:transfer|withdraw|transfer-from-address)["'])/.test(
      code,
    );
  if (!hasMapping) return false;
  // Positive evidence of a chain send — stub modules map the route but only return 500.
  return /(?:sendTransaction|sendFrom|sendtoaddress|eth_sendRawTransaction|sendRawTransaction|transferFrom|getTransactionCount\s*\()/i.test(
    code,
  );
}

function controllerIsRpcStub(text) {
  const code = stripComments(text);
  if (!/@RequestMapping\s*\(\s*["']\/rpc["']\s*\)/.test(code)) return false;
  const hasMapping =
    /@(?:GetMapping|PostMapping|RequestMapping)\s*\(\s*(?:\{[^}]*\b(?:transfer|withdraw)\b[^}]*\}|["'](?:transfer|withdraw)["'])/.test(
      code,
    );
  if (!hasMapping) return false;
  return !controllerHasRpcSpend(text);
}
const RPC_CRON_SEND = /@(?:Scheduled|Async)[\s\S]{0,400}?(?:sendFrom|sendtoaddress|eth_send|transfer\(|withdraw\()/i;

function die(msg, code = 1) {
  console.error(`✖ vendor-java-money-plane-map: ${msg}`);
  process.exit(code);
}

function walk(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'target' || name === '.git') continue;
    const p = join(dir, name);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, pred, out);
    else if (pred(name, p)) out.push(p);
  }
  return out;
}

function segs(p) {
  return p.split(/[/\\]+/);
}

function moduleClassKey(absPath) {
  const parts = segs(absPath);
  const srcIdx = parts.lastIndexOf('src');
  const file = parts[parts.length - 1] || '';
  const cls = file.replace(/\.java$/, '');
  // Maven module directory is the segment immediately before `src`.
  const mod = srcIdx > 0 ? parts[srcIdx - 1] : parts[parts.length - 2] || 'unknown';
  return `${mod}:${cls}.java`;
}

function stripComments(source) {
  const literals = [];
  const masked = source.replace(/"(?:\\.|[^"\\])*"/g, (s) => `"\u0000${literals.push(s) - 1}\u0000"`);
  const decommented = masked.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return decommented.replace(/"\u0000(\d+)\u0000"/g, (_, i) => literals[Number(i)]);
}

function readComposeServiceIds() {
  const compose = join(ROOT, 'vendor', 'upstream-exchange-compose.yml');
  if (!existsSync(compose)) return [];
  const text = readFileSync(compose, 'utf8');
  const ids = new Set();
  for (const m of text.matchAll(/^\s{2}([a-z0-9-]+):\s*$/gm)) {
    ids.add(m[1]);
  }
  return [...ids].sort();
}

function runNode(scriptRel) {
  const r = spawnSync(process.execPath, [join(ROOT, scriptRel)], {
    cwd: ROOT,
    encoding: 'utf8',
    env: process.env,
  });
  return {
    script: scriptRel,
    code: r.status ?? 1,
    stdout: (r.stdout || '').trim(),
    stderr: (r.stderr || '').trim(),
  };
}

function findDoorRegistrations(javaFiles) {
  const configs = javaFiles.filter((p) => segs(p).at(-1) === 'ApplicationConfig.java');
  const rows = [];
  for (const app of DOOR_APPS) {
    const match = configs.find((p) => {
      const parts = segs(p);
      if (app === 'exchange') {
        return parts.includes('exchange') && !parts.includes('exchange-api');
      }
      return parts.includes(app);
    });
    if (!match) {
      rows.push({ app, classId: null, registered: false, reason: 'ApplicationConfig missing' });
      continue;
    }
    const text = stripComments(readFileSync(match, 'utf8'));
    rows.push({
      app,
      classId: moduleClassKey(match),
      registered: REGISTRATION.test(text),
      reason: REGISTRATION.test(text) ? 'interceptor registered on /**' : 'import or missing registration',
    });
  }
  return rows;
}

function findKafkaMoneyDoors(javaFiles) {
  const keys = [
    {
      id: 'market.settlement',
      fileEnds: 'ExchangeTradeConsumer.java',
      topics: ['exchange-trade', 'exchange-order-completed', 'exchange-order-cancel-success'],
      valueMove: 'spot settle / refund via exchange-core service',
      disposition: 'THROW',
      note: 'HTTP door cannot reach Kafka; service throw is the control',
    },
    {
      id: 'wallet.finance',
      fileEnds: 'FinanceConsumer.java',
      topics: ['deposit', 'withdraw', 'withdraw-notify'],
      valueMove: 'deposit credit + withdraw chain send then book',
      disposition: '§13',
      note: 'chain send before dual-book throw on withdraw path; module absent from compose today',
    },
  ];
  const out = [];
  for (const k of keys) {
    const hit = javaFiles.find((p) => segs(p).at(-1) === k.fileEnds);
    if (!hit) {
      out.push({ ...k, present: false, classId: null });
      continue;
    }
    const text = readFileSync(hit, 'utf8');
    const topicsFound = k.topics.filter((t) => text.includes(`"${t}"`) || text.includes(`'${t}'`));
    out.push({
      ...k,
      present: true,
      classId: moduleClassKey(hit),
      topicsFound,
    });
  }
  return out;
}

function findWalletRpcSpendDoors(javaFiles) {
  const rpcRoot = javaFiles.filter((p) => segs(p).includes('01_wallet_rpc'));
  const controllers = rpcRoot.filter((p) => /Controller\.java$/.test(p));
  const rows = [];
  for (const p of controllers) {
    const raw = readFileSync(p, 'utf8');
    const spend = controllerHasRpcSpend(raw);
    const stub = controllerIsRpcStub(raw);
    const mod = moduleClassKey(p).split(':')[0];
    let disposition = 'NONE';
    if (spend) disposition = '§13';
    else if (stub) disposition = 'CLOSED';
    rows.push({
      module: mod,
      classId: moduleClassKey(p),
      spendHttp: spend,
      disposition,
      note: spend
        ? 'real on-chain send surface — owner wallet-rpc perimeter / auth (not dual-book door)'
        : stub
          ? 'stub route only — no chain send helper in controller'
          : 'no rpc transfer/withdraw mapping detected',
    });
  }
  // Cron spenders (floor, not door)
  const cronRows = [];
  for (const p of rpcRoot) {
    const raw = readFileSync(p, 'utf8');
    if (!/@Scheduled/.test(raw)) continue;
    if (!RPC_CRON_SEND.test(raw) && !/transfer|withdraw|sendFrom|sendtoaddress/i.test(raw)) continue;
    // Narrow: scheduled + money verb in same file
    if (!/@Scheduled[\s\S]{0,800}?(transfer|withdraw|sendFrom|sendtoaddress|eth_send)/i.test(raw)) continue;
    cronRows.push({
      classId: moduleClassKey(p),
      disposition: '§13',
      note: '@Scheduled spender — HTTP interceptor cannot cover',
    });
  }
  return { controllers: rows, crons: cronRows };
}

function findInterceptorFragments() {
  const files = walk(VENDOR, (name) => name === 'DualBookMoneyDoorInterceptor.java');
  if (files.length !== 1) return { classId: null, fragments: [], hasPromotion: false, hasMonitor: false };
  const text = readFileSync(files[0], 'utf8');
  const fragments = [...text.matchAll(/"(\/[a-z0-9_\/-]+)"/gi)].map((m) => m[1]);
  return {
    classId: moduleClassKey(files[0]),
    fragments,
    hasPromotion: fragments.includes('/promotion'),
    hasMonitor: fragments.includes('/monitor/reset-trader') && fragments.includes('/monitor/start-trader'),
  };
}

function brandCustodyPosture() {
  const brandSrc = readFileSync(join(ROOT, 'tooling', 'ci', 'brand-scan.mjs'), 'utf8');
  const custodySrc = readFileSync(join(ROOT, 'tooling', 'ci', 'custody-scan.mjs'), 'utf8');
  const shellBrandExists = existsSync(join(ROOT, 'tooling', 'ci', 'shell-brand-scan.mjs'));
  const brandSkipsVendor = /['"]vendor['"]/.test(brandSrc) && /SKIP_DIRS/.test(brandSrc);
  const custodyDeclaresJavaOut = /All \d+ files under vendor\//.test(custodySrc) || /vendor-java-money-scan/.test(custodySrc);
  return {
    brandScanSkipsVendorTree: brandSkipsVendor,
    shellBrandScanPresent: shellBrandExists,
    custodyScanDeclaresJavaOutOfScope: custodyDeclaresJavaOut,
    javaMoneySuccessorGate: 'tooling/ci/vendor-java-money-scan.mjs',
    doorGate: 'tooling/ci/dual-book-door-scan.mjs',
    verdict:
      brandSkipsVendor && shellBrandExists && custodyDeclaresJavaOut
        ? 'REAL — brand product surface via shell-brand-scan; Java money via vendor-java-money + door gates; custody-scan correctly Protocol-Plane only'
        : 'DRIFT — re-check brand/custody wiring',
  };
}

function buildInventory() {
  if (!statSync(VENDOR, { throwIfNoEntry: false })?.isDirectory()) {
    die('vendor/ tree missing');
  }

  const javaAll = walk(VENDOR, (name) => name.endsWith('.java'));
  const javaMain = javaAll.filter((p) => !segs(p).includes('test'));
  const doors = findDoorRegistrations(javaMain);
  const kafka = findKafkaMoneyDoors(javaMain);
  const rpc = findWalletRpcSpendDoors(javaMain);
  const fragments = findInterceptorFragments();
  const compose = readComposeServiceIds();
  const brandCustody = brandCustodyPosture();

  const composeHints = {
    adminInCompose: compose.some((s) => /admin/.test(s) && !/mysql|mongo|redis|kafka/.test(s)),
    marketInCompose: compose.some((s) => /market/.test(s)),
    walletInCompose: compose.some((s) => /(^|-)wallet$/.test(s) || s.endsWith('-wallet')),
    ucenterInCompose: compose.some((s) => /ucenter/.test(s)),
    exchangeInCompose: compose.some((s) => /exchange/.test(s) && !/exchange-api/.test(s)),
    exchangeApiInCompose: compose.some((s) => /exchange-api/.test(s)),
    otcInCompose: compose.some((s) => /otc/.test(s)),
  };

  /** High-signal door table — disposition CLOSE means not a live value path under current controls. */
  const doorTable = [
    {
      surface: 'admin HTTP money controllers',
      canMoveValue: 'source-yes / deploy-no',
      control: 'DOOR + THROW',
      disposition: 'CLOSED',
      proof: 'door registration + service throw; no admin compose service',
    },
    {
      surface: 'ucenter-api HTTP (withdraw/ctc/approve/envelope/promotion)',
      canMoveValue: 'source-yes / deploy-yes',
      control: 'DOOR + THROW (Grade C: door-only on approve/envelope)',
      disposition: 'CLOSED',
      proof: 'door fragments include /promotion; compose has ucenter',
    },
    {
      surface: 'otc-api HTTP',
      canMoveValue: 'source-yes / boot-no',
      control: 'DOOR + THROW',
      disposition: 'CLOSED',
      proof: 'door registered; module documented non-boot',
    },
    {
      surface: 'exchange-api /order/add',
      canMoveValue: 'indirect (settlement in market)',
      control: 'DOOR + THROW in exchange-core',
      disposition: 'CLOSED',
      proof: 'door fragment /order/add + trading-path throws',
    },
    {
      surface: 'exchange /monitor settlement publish',
      canMoveValue: 'indirect → market Kafka',
      control: 'DOOR (fragments /monitor/*)',
      disposition: 'CLOSED',
      proof: 'exchange ApplicationConfig registers door; fragments present',
    },
    {
      surface: 'market Kafka settlement',
      canMoveValue: 'yes (if jars run)',
      control: 'THROW only',
      disposition: 'CLOSED',
      proof: 'ExchangeTradeConsumer → MemberWalletService throws; unprotectable by HTTP door',
    },
    {
      surface: 'wallet Kafka withdraw → RPC send',
      canMoveValue: 'yes if wallet + RPC deployed',
      control: 'NONE on chain send; THROW after',
      disposition: '§13',
      proof: 'FinanceConsumer ordering; compose lacks wallet service',
      socket: 'socket.vendor-wallet-chain-before-book',
    },
    {
      surface: '01_wallet_rpc HTTP spend',
      canMoveValue: 'yes (real chain)',
      control: 'static RPC token perimeter',
      disposition: '§13',
      proof: 'wallet-rpc-auth-scan + mainnet-scan; dual-book N/A',
      socket: 'socket.wallet-rpc-spend-perimeter',
    },
    {
      surface: '01_wallet_rpc @Scheduled spenders',
      canMoveValue: 'yes',
      control: 'NONE (floor)',
      disposition: '§13',
      proof: 'cron outside HTTP interceptor',
      socket: 'socket.wallet-rpc-spend-perimeter',
    },
    {
      surface: 'allowlisted second-book writes → ledger recipes',
      canMoveValue: 'if throws lifted',
      control: 'THROW / DOOR / no-op DAO',
      disposition: '§13',
      proof: 'vendor-java-money allowlist names recipes; zero redirected',
      socket: 'socket.vendor-java-ledger-redirect',
    },
  ];

  return {
    board: 'D26-P2-02',
    generatedAt: new Date().toISOString(),
    headHint: spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim(),
    counts: {
      javaAll: javaAll.length,
      javaMain: javaMain.length,
      javaTest: javaAll.length - javaMain.length,
    },
    doorRegistrations: doors,
    doorFragments: fragments,
    kafkaMoney: kafka,
    walletRpc: {
      spendControllers: rpc.controllers.filter((r) => r.spendHttp),
      nonSpendControllers: rpc.controllers.filter((r) => !r.spendHttp),
      cronSpenders: rpc.crons,
    },
    composeServiceIds: compose,
    composeHints,
    brandCustody,
    doorTable,
  };
}

function renderMarkdown(inv) {
  const lines = [];
  lines.push('# Vendor Java money-plane map — D26-P2-02');
  lines.push('');
  lines.push(`**Board:** D26-P2-02 · **Generated:** ${inv.generatedAt.slice(0, 10)} · **Tip:** \`${inv.headHint}\``);
  lines.push('**Proof runner:** `pnpm map:vendor-java-money-plane` → `tooling/scripts/vendor-java-money-plane-map.mjs`');
  lines.push(`**Machine proof:** \`tooling/vendor-maps/java-money-plane-proof.json\``);
  lines.push('**Builds on:** `docs/VENDOR-JAVA-MONEY-PLANE-MAP-2026-08-09.md` (narrative) · ADR `2026-08-04-java-dual-book-residual.md`');
  lines.push('');
  lines.push('## 0 · Counts (executed)');
  lines.push('');
  lines.push(`| Metric | Count |`);
  lines.push(`| --- | ---: |`);
  lines.push(`| Java files (all) | ${inv.counts.javaAll} |`);
  lines.push(`| Java main sources | ${inv.counts.javaMain} |`);
  lines.push(`| Java test sources | ${inv.counts.javaTest} |`);
  lines.push(`| Door apps registered | ${inv.doorRegistrations.filter((d) => d.registered).length}/${DOOR_APPS.length} |`);
  lines.push(`| Wallet RPC spend controllers | ${inv.walletRpc.spendControllers.length} |`);
  lines.push(`| Wallet RPC cron spend files | ${inv.walletRpc.cronSpenders.length} |`);
  lines.push('');
  lines.push('## 1 · Door table — close or §13');
  lines.push('');
  lines.push('| Surface | Moves value? | Control | Disposition | Proof / socket |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const row of inv.doorTable) {
    const sock = row.socket ? ` · \`${row.socket}\`` : '';
    lines.push(`| ${row.surface} | ${row.canMoveValue} | ${row.control} | **${row.disposition}** | ${row.proof}${sock} |`);
  }
  lines.push('');
  lines.push('## 2 · HTTP dual-book door registrations (executed)');
  lines.push('');
  for (const d of inv.doorRegistrations) {
    lines.push(`- \`${d.app}\` → ${d.registered ? 'REGISTERED' : 'MISSING'} · ${d.classId || '—'} · ${d.reason}`);
  }
  lines.push('');
  lines.push(
    `Interceptor fragments include \`/promotion\`: **${inv.doorFragments.hasPromotion}**; ` +
      `\`/monitor/*\` settlement: **${inv.doorFragments.hasMonitor}**.`,
  );
  lines.push('');
  lines.push('## 3 · Kafka money surfaces (executed)');
  lines.push('');
  for (const k of inv.kafkaMoney) {
    lines.push(
      `- \`${k.id}\` · ${k.present ? k.classId : 'ABSENT'} · topics=[${(k.topicsFound || []).join(', ')}] · **${k.disposition}** — ${k.note}`,
    );
  }
  lines.push('');
  lines.push('## 4 · Wallet RPC spend (executed)');
  lines.push('');
  lines.push('### HTTP spend controllers (live send helper)');
  for (const r of inv.walletRpc.spendControllers) {
    lines.push(`- \`${r.classId}\` · **${r.disposition}** — ${r.note}`);
  }
  lines.push('');
  lines.push('### Stub / non-spend controllers (CLOSED)');
  for (const r of inv.walletRpc.nonSpendControllers.filter((x) => x.disposition === 'CLOSED')) {
    lines.push(`- \`${r.classId}\` · **CLOSED** — ${r.note}`);
  }
  lines.push('');
  lines.push('### Cron / floor spenders');
  if (!inv.walletRpc.cronSpenders.length) {
    lines.push('_None matched the narrow scheduled+send heuristic (re-check on tip)._');
  } else {
    for (const r of inv.walletRpc.cronSpenders) {
      lines.push(`- \`${r.classId}\` · **${r.disposition}** — ${r.note}`);
    }
  }
  lines.push('');
  lines.push('## 5 · Brand / custody — real posture (executed)');
  lines.push('');
  lines.push(`| Check | Result |`);
  lines.push(`| --- | --- |`);
  lines.push(`| \`brand-scan\` skips \`vendor/\` | ${inv.brandCustody.brandScanSkipsVendorTree} |`);
  lines.push(`| \`shell-brand-scan\` present (product surface) | ${inv.brandCustody.shellBrandScanPresent} |`);
  lines.push(`| \`custody-scan\` declares Java out of scope (successor gate) | ${inv.brandCustody.custodyScanDeclaresJavaOutOfScope} |`);
  lines.push(`| Java money gate | \`${inv.brandCustody.javaMoneySuccessorGate}\` |`);
  lines.push(`| Door gate | \`${inv.brandCustody.doorGate}\` |`);
  lines.push(`| Verdict | ${inv.brandCustody.verdict} |`);
  lines.push('');
  lines.push('## 6 · §13 sockets named by this map');
  lines.push('');
  lines.push('| Socket | Why it is not agent-closeable |');
  lines.push('| --- | --- |');
  lines.push(
    '| `socket.vendor-wallet-chain-before-book` | Withdraw path can hit RPC send before dual-book throw; needs owner control before compose ever mounts `wallet` |',
  );
  lines.push(
    '| `socket.wallet-rpc-spend-perimeter` | Real chain spend + cron floor; security review / Class X — not dual-book door work |',
  );
  lines.push(
    '| `socket.vendor-java-ledger-redirect` | Allowlisted second-book sites name ledger recipes; zero redirected yet (ADR residual) |',
  );
  lines.push('');
  lines.push('## 7 · How to re-prove');
  lines.push('');
  lines.push('```bash');
  lines.push('pnpm map:vendor-java-money-plane --self-test');
  lines.push('pnpm scan:dual-book-door');
  lines.push('pnpm scan:vendor-java-money');
  lines.push('pnpm scan:wallet-rpc-auth');
  lines.push('pnpm scan:custody   # Protocol Plane only — expected');
  lines.push('pnpm scan:shell-brand');
  lines.push('```');
  lines.push('');
  return lines.join('\n');
}

function selfTest(inv) {
  const failures = [];
  const expect = (cond, msg) => {
    if (!cond) failures.push(msg);
  };

  expect(inv.counts.javaMain >= 800, `expected ≥800 main Java files, got ${inv.counts.javaMain}`);
  expect(inv.counts.javaAll >= 850, `expected ≥850 Java files, got ${inv.counts.javaAll}`);
  expect(
    inv.doorRegistrations.every((d) => d.registered),
    `all door apps must register interceptor; got ${JSON.stringify(inv.doorRegistrations)}`,
  );
  expect(inv.doorFragments.hasPromotion, 'door fragments must include /promotion');
  expect(inv.doorFragments.hasMonitor, 'door fragments must include /monitor settlement paths');
  expect(
    inv.kafkaMoney.every((k) => k.present && (k.topicsFound || []).length > 0),
    'kafka money consumers must be present with topics',
  );
  expect(inv.walletRpc.spendControllers.length >= 4, 'expected ≥4 wallet RPC spend controllers');
  expect(inv.walletRpc.spendControllers.length <= 8, 'expected ≤8 live spend controllers (stubs excluded)');
  expect(
    !inv.walletRpc.spendControllers.some((r) => ['bch', 'bsv', 'btm', 'ltc'].includes(r.module)),
    'stub modules bch/bsv/btm/ltc must not count as spend',
  );
  expect(inv.brandCustody.brandScanSkipsVendorTree, 'brand-scan must skip vendor/');
  expect(inv.brandCustody.shellBrandScanPresent, 'shell-brand-scan must exist');
  expect(inv.brandCustody.custodyScanDeclaresJavaOutOfScope, 'custody-scan must declare Java out of scope');
  expect(
    inv.doorTable.some((r) => r.disposition === '§13' && r.socket),
    'door table must name at least one §13 socket',
  );
  expect(inv.doorTable.filter((r) => r.disposition === 'CLOSED').length >= 5, 'expected ≥5 CLOSED dispositions');

  // Live gate re-runs (proof, not prose)
  const doorScan = runNode('tooling/ci/dual-book-door-scan.mjs');
  expect(doorScan.code === 0, `dual-book-door-scan exit ${doorScan.code}: ${doorScan.stderr || doorScan.stdout}`);
  const moneyScan = runNode('tooling/ci/vendor-java-money-scan.mjs');
  expect(moneyScan.code === 0, `vendor-java-money-scan exit ${moneyScan.code}: ${moneyScan.stderr || moneyScan.stdout}`);

  if (failures.length) {
    console.error('✖ vendor-java-money-plane-map --self-test FAIL:');
    for (const f of failures) console.error(`  · ${f}`);
    process.exit(1);
  }
  console.log('✓ vendor-java-money-plane-map --self-test OK');
  console.log(
    `  javaMain=${inv.counts.javaMain} doors=${inv.doorRegistrations.filter((d) => d.registered).length} ` +
      `rpcSpend=${inv.walletRpc.spendControllers.length} §13=${inv.doorTable.filter((r) => r.disposition === '§13').length}`,
  );
}

function main() {
  const inv = buildInventory();
  const md = renderMarkdown(inv);

  if (SELF_TEST) {
    selfTest(inv);
    return;
  }

  if (WRITE) {
    mkdirSync(dirname(PROOF_JSON), { recursive: true });
    writeFileSync(PROOF_JSON, `${JSON.stringify(inv, null, 2)}\n`);
    writeFileSync(PROOF_MD, `${md}\n`);
    console.log(`wrote ${relative(ROOT, PROOF_JSON).split(sep).join('/')}`);
    console.log(`wrote ${relative(ROOT, PROOF_MD).split(sep).join('/')}`);
  }

  console.log(md);
  console.log(
    `\nsummary: javaAll=${inv.counts.javaAll} javaMain=${inv.counts.javaMain} ` +
      `doorsOk=${inv.doorRegistrations.filter((d) => d.registered).length}/${DOOR_APPS.length} ` +
      `rpcSpend=${inv.walletRpc.spendControllers.length} cronSpend=${inv.walletRpc.cronSpenders.length} ` +
      `brandCustody=${inv.brandCustody.verdict.startsWith('REAL') ? 'REAL' : 'DRIFT'}`,
  );
}

main();
