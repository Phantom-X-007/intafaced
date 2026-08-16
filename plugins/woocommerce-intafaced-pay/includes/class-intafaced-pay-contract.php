<?php
/**
 * Pure public-API contract helpers (no WordPress, no money book).
 *
 * Pins must match services/svc-pay/src/plugins/reference-client.ts and
 * webhook-vectors.ts. Do not invent HMAC headers or JSON-number amounts.
 *
 * @package Intafaced_Pay
 */

declare(strict_types=1);

final class Intafaced_Pay_Contract {
	public const PUBLIC_API_BASE = '/api/pay/v1';
	public const HEADER_SIGNATURE = 'x-intafaced-signature';
	public const HEADER_TIMESTAMP = 'x-intafaced-timestamp';
	public const KEY_PREFIX_SANDBOX = 'ifc_test_';
	public const KEY_PREFIX_LIVE = 'ifc_';
	public const WEBHOOK_TOLERANCE_SECONDS = 300;

	/**
	 * @return 'sandbox'|'live'
	 */
	public static function detect_key_mode(string $api_key): string {
		if (str_starts_with($api_key, self::KEY_PREFIX_SANDBOX)) {
			return 'sandbox';
		}
		if (str_starts_with($api_key, self::KEY_PREFIX_LIVE)) {
			return 'live';
		}
		throw new InvalidArgumentException('INTAFACED Pay: API key must start with ifc_test_ (sandbox) or ifc_ (live)');
	}

	/**
	 * @param 'sandbox'|'live' $configured_mode
	 */
	public static function assert_key_mode(string $api_key, string $configured_mode): void {
		$detected = self::detect_key_mode($api_key);
		if ($configured_mode !== 'sandbox' && $configured_mode !== 'live') {
			throw new InvalidArgumentException('INTAFACED Pay: key mode must be sandbox or live');
		}
		if ($detected !== $configured_mode) {
			throw new InvalidArgumentException(
				'INTAFACED Pay: key mode mismatch (configured ' . $configured_mode . ', key is ' . $detected . ')'
			);
		}
	}

	public static function assert_decimal_amount(string $amount): void {
		if (!preg_match('/^\d+(\.\d+)?$/', trim($amount))) {
			throw new InvalidArgumentException('INTAFACED Pay: amount must be a non-negative decimal string');
		}
	}

	/**
	 * HMAC-SHA256 hex of `{timestamp}.{rawBody}` — same construction as
	 * signMerchantWebhook / rails webhook-signature.signPayload.
	 */
	public static function sign_merchant_webhook(string $secret, string $timestamp_seconds, string $raw_body): string {
		return hash_hmac('sha256', $timestamp_seconds . '.' . $raw_body, $secret);
	}

	public static function verify_merchant_webhook(
		string $secret,
		string $raw_body,
		?string $signature_hex,
		?string $timestamp_seconds,
		?int $now_unix = null,
		int $tolerance_seconds = self::WEBHOOK_TOLERANCE_SECONDS
	): bool {
		if ($signature_hex === null || $signature_hex === '' || $timestamp_seconds === null || $timestamp_seconds === '' || $secret === '') {
			return false;
		}
		if (!preg_match('/^[0-9a-f]+$/i', $signature_hex)) {
			return false;
		}
		if (!preg_match('/^-?\d+$/', $timestamp_seconds)) {
			return false;
		}
		$signed_at = (int) $timestamp_seconds;
		$now = $now_unix ?? time();
		if (abs($now - $signed_at) > $tolerance_seconds) {
			return false;
		}
		$expected = self::sign_merchant_webhook($secret, $timestamp_seconds, $raw_body);
		if (strlen($expected) !== strlen($signature_hex)) {
			return false;
		}
		return hash_equals($expected, strtolower($signature_hex));
	}

	/**
	 * Build (do not send) POST /api/pay/v1/payments.
	 *
	 * @param array{merchantId:string,amount:string,assetId:string,method:string,railAdapter?:string,profileId?:string,metadata?:array<string,mixed>} $body
	 * @return array{method:string,path:string,headers:array<string,string>,body:string}
	 */
	public static function build_create_payment_request(string $api_key, array $body, string $idempotency_key): array {
		if (trim($idempotency_key) === '') {
			throw new InvalidArgumentException('INTAFACED Pay: Idempotency-Key is required on money POSTs');
		}
		self::assert_decimal_amount($body['amount']);
		$payload = array(
			'merchantId' => $body['merchantId'],
			'amount'     => (string) $body['amount'],
			'assetId'    => $body['assetId'],
			'method'     => $body['method'],
		);
		if (isset($body['railAdapter'])) {
			$payload['railAdapter'] = $body['railAdapter'];
		}
		if (isset($body['profileId'])) {
			$payload['profileId'] = $body['profileId'];
		}
		if (isset($body['metadata'])) {
			$payload['metadata'] = $body['metadata'];
		}
		$raw = json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
		$parsed = json_decode($raw, true);
		if (!is_array($parsed) || !is_string($parsed['amount'] ?? null)) {
			throw new InvalidArgumentException('INTAFACED Pay: amount must serialise as a JSON string');
		}
		return array(
			'method'  => 'POST',
			'path'    => self::PUBLIC_API_BASE . '/payments',
			'headers' => array(
				'Authorization'   => 'Bearer ' . $api_key,
				'Content-Type'    => 'application/json',
				'Idempotency-Key' => $idempotency_key,
			),
			'body'    => $raw,
		);
	}

	public static function absolute_url(string $base_url, string $path): string {
		$base = rtrim($base_url, '/');
		return $base . (str_starts_with($path, '/') ? $path : '/' . $path);
	}
}
