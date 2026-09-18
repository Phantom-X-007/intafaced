/**
 * WooCommerce adapter contract — fail if public REST / HMAC pins drift.
 *
 * Reads plugins/woocommerce-intafaced-pay (PHP) against frozen vectors in
 * webhook-vectors.ts and PAY_PUBLIC_API_BASE from the TypeScript reference client.
 * Does not re-declare HMAC header names.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PAY_PUBLIC_API_BASE, signMerchantWebhook, verifyMerchantWebhook } from './reference-client.js';
import { frozenWebhookVectors, MERCHANT_WEBHOOK_HEADERS } from './webhook-vectors.js';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const wooRoot = join(repoRoot, 'plugins', 'woocommerce-intafaced-pay');

/** One php -r of the contract helper; hung php must not pin the worker. */
const PHP_SPAWN_TIMEOUT_MS = 8_000;
/** Many sequential spawnSync calls; vitest 5s default is below CI php cold-start. */
const PHP_HELPER_TEST_TIMEOUT_MS = 30_000;

function spawnPhp(code: string) {
  return spawnSync('php', ['-r', code], {
    encoding: 'utf8' as const,
    timeout: PHP_SPAWN_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
}

function phpMissingFromPath(ran: ReturnType<typeof spawnPhp>): boolean {
  const err = ran.error as NodeJS.ErrnoException | undefined;
  return err?.code === 'ENOENT';
}

function assertPhpSpawnOk(ran: ReturnType<typeof spawnPhp>, label: string): void {
  if (ran.error) {
    throw new Error(`${label}: ${ran.error.message}`);
  }
  expect(ran.status, ran.stderr).toBe(0);
}

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walkFiles(p));
    else out.push(p);
  }
  return out;
}

function phpSources(): string {
  return walkFiles(wooRoot)
    .filter((f) => extname(f).toLowerCase() === '.php')
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n');
}

describe('pay.plugins — WooCommerce adapter contract', () => {
  it('ships an installable WooCommerce plugin tree (not a restamped TS client)', () => {
    expect(existsSync(join(wooRoot, 'intafaced-pay.php'))).toBe(true);
    expect(existsSync(join(wooRoot, 'includes', 'class-intafaced-pay-contract.php'))).toBe(true);
    expect(existsSync(join(wooRoot, 'includes', 'class-intafaced-pay-gateway.php'))).toBe(true);
    expect(existsSync(join(wooRoot, 'includes', 'class-intafaced-pay-webhook.php'))).toBe(true);
    const boot = readFileSync(join(wooRoot, 'intafaced-pay.php'), 'utf8');
    expect(boot).toMatch(/Plugin Name:\s*INTAFACED Pay/);
    expect(boot).toMatch(/Requires Plugins:\s*woocommerce/);
    expect(boot).toMatch(/WC_Payment_Gateway/);
    expect(boot).not.toMatch(/from ['"]\.\/reference-client/);
  });

  it('pins create-payment to the public REST contract', () => {
    const src = phpSources();
    expect(PAY_PUBLIC_API_BASE).toBe('/api/pay/v1');
    expect(src).toContain(`PUBLIC_API_BASE = '${PAY_PUBLIC_API_BASE}'`);
    expect(src).toContain("PUBLIC_API_BASE . '/payments'");
    expect(src).toMatch(/'Authorization'\s*=>\s*'Bearer '/);
    expect(src).toMatch(/'Idempotency-Key'/);
    expect(src).toMatch(/Idempotency-Key is required on money POSTs/);
    expect(src).toMatch(/\(string\) \$body\['amount'\]/);
    expect(src).toMatch(/amount must serialise as a JSON string/);
    expect(src).not.toMatch(/json_encode\(\s*\$amount\s*\)/);
  });

  it('pins webhook headers and HMAC construction to frozen vectors', () => {
    expect(MERCHANT_WEBHOOK_HEADERS.signature).toBe('x-intafaced-signature');
    expect(MERCHANT_WEBHOOK_HEADERS.timestamp).toBe('x-intafaced-timestamp');
    const src = phpSources();
    expect(src).toContain(`HEADER_SIGNATURE = '${MERCHANT_WEBHOOK_HEADERS.signature}'`);
    expect(src).toContain(`HEADER_TIMESTAMP = '${MERCHANT_WEBHOOK_HEADERS.timestamp}'`);
    expect(src).toMatch(/hash_hmac\(\s*'sha256'\s*,\s*\$timestamp_seconds\s*\.\s*'\.'\s*\.\s*\$raw_body\s*,\s*\$secret\s*\)/);

    for (const v of frozenWebhookVectors()) {
      expect(signMerchantWebhook(v.secret, v.timestampSeconds, v.rawBody), v.name).toBe(v.signatureHex);
      expect(
        verifyMerchantWebhook({
          secret: v.secret,
          rawBody: v.rawBody,
          signatureHex: v.signatureHex,
          timestampSeconds: v.timestampSeconds,
          now: new Date(Number(v.timestampSeconds) * 1000),
          toleranceSeconds: 300,
        }),
      ).toBe(true);
    }
  });

  it('sandbox vs live key mode follows ifc_test_ / ifc_ prefixes', () => {
    const src = phpSources();
    expect(src).toContain("KEY_PREFIX_SANDBOX = 'ifc_test_'");
    expect(src).toContain("KEY_PREFIX_LIVE = 'ifc_'");
    expect(src).toMatch(/assert_key_mode/);
    expect(src).toMatch(/key mode mismatch/);
  });

  it('does not send IEEE get_total() as the ledger amount', () => {
    const gateway = readFileSync(join(wooRoot, 'includes', 'class-intafaced-pay-gateway.php'), 'utf8');
    const contract = readFileSync(join(wooRoot, 'includes', 'class-intafaced-pay-contract.php'), 'utf8');
    expect(gateway).not.toMatch(/\$amount\s*=\s*\(string\)\s*\$order->get_total\s*\(/);
    expect(gateway).toMatch(/decimal_amount_from_woo_total\s*\(\s*\$order->get_total\s*\(\s*'edit'\s*\)\s*\)/);
    expect(contract).toMatch(/function decimal_amount_from_woo_total\s*\(\s*mixed\s+\$total\s*\)/);
    expect(contract).toMatch(/function decimal_from_minor_units\s*\(\s*string\s+\$minor\s*\)/);
    expect(contract).toMatch(/IEEE\/float order total refused/);
    expect(contract).not.toMatch(/\$total\s*\*\s*100/);
    expect(contract).not.toMatch(/\(float\)/);
  });

  it('PHP helper refuses 0.1-class / float-formatted totals when php is on PATH', { timeout: PHP_HELPER_TEST_TIMEOUT_MS }, () => {
    const probe = spawnPhp('echo PHP_VERSION;');
    if (phpMissingFromPath(probe)) {
      expect(existsSync(join(wooRoot, 'includes', 'class-intafaced-pay-contract.php'))).toBe(true);
      return;
    }
    assertPhpSpawnOk(probe, 'php probe');
    const contractPath = join(wooRoot, 'includes', 'class-intafaced-pay-contract.php').replace(/\\/g, '/');

    const evalAmount = (phpExpr: string): { ok: boolean; value: string } => {
      const php = `
        require '${contractPath}';
        try {
          $out = Intafaced_Pay_Contract::decimal_amount_from_woo_total(${phpExpr});
          echo json_encode(['ok' => true, 'value' => $out]);
        } catch (Throwable $e) {
          echo json_encode(['ok' => false, 'value' => $e->getMessage()]);
        }
      `;
      const ran = spawnPhp(php);
      assertPhpSpawnOk(ran, `decimal_amount_from_woo_total(${phpExpr})`);
      return JSON.parse(ran.stdout) as { ok: boolean; value: string };
    };

    expect(evalAmount('0.1')).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount('10.1')).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("json_decode('0.1')")).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("'10.100000000000001'")).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("'19.989999999999998'")).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("'1.0e-1'")).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("'1E+2'")).toEqual({ ok: false, value: expect.stringMatching(/IEEE\/float/) });
    expect(evalAmount("'19.99'")).toEqual({ ok: true, value: '19.99' });
    expect(evalAmount("'0.1'")).toEqual({ ok: true, value: '0.10' });
    expect(evalAmount("'0.10'")).toEqual({ ok: true, value: '0.10' });
    expect(evalAmount('20')).toEqual({ ok: true, value: '20.00' });
    expect(evalAmount('0')).toEqual({ ok: true, value: '0.00' });
    expect(evalAmount("'10.1000'")).toEqual({ ok: true, value: '10.10' });

    const minorPhp = `
      require '${contractPath}';
      echo Intafaced_Pay_Contract::decimal_from_minor_units('1999');
    `;
    const minor = spawnPhp(minorPhp);
    assertPhpSpawnOk(minor, 'decimal_from_minor_units');
    expect(minor.stdout.trim()).toBe('19.99');
  });

  it('PHP contract matches frozen HMAC vectors when php is on PATH', { timeout: PHP_HELPER_TEST_TIMEOUT_MS }, () => {
    const probe = spawnPhp('echo PHP_VERSION;');
    if (phpMissingFromPath(probe)) {
      expect(existsSync(join(wooRoot, 'includes', 'class-intafaced-pay-contract.php'))).toBe(true);
      return;
    }
    assertPhpSpawnOk(probe, 'php probe');
    const contractPath = join(wooRoot, 'includes', 'class-intafaced-pay-contract.php').replace(/\\/g, '/');
    for (const v of frozenWebhookVectors()) {
      const php = `
        require '${contractPath}';
        echo Intafaced_Pay_Contract::sign_merchant_webhook(${JSON.stringify(v.secret)}, ${JSON.stringify(v.timestampSeconds)}, ${JSON.stringify(v.rawBody)});
      `;
      const signed = spawnPhp(php);
      assertPhpSpawnOk(signed, `sign_merchant_webhook ${v.name}`);
      expect(signed.stdout.trim(), v.name).toBe(v.signatureHex);

      const verifyPhp = `
        require '${contractPath}';
        $ok = Intafaced_Pay_Contract::verify_merchant_webhook(
          ${JSON.stringify(v.secret)},
          ${JSON.stringify(v.rawBody)},
          ${JSON.stringify(v.signatureHex)},
          ${JSON.stringify(v.timestampSeconds)},
          ${Number(v.timestampSeconds)}
        );
        echo $ok ? 'true' : 'false';
      `;
      const verified = spawnPhp(verifyPhp);
      assertPhpSpawnOk(verified, `verify_merchant_webhook ${v.name}`);
      expect(verified.stdout.trim(), v.name).toBe('true');
    }
  });
});
