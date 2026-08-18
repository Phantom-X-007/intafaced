<?php
/**
 * Merchant webhook receiver — HMAC pins from webhook-vectors.ts.
 *
 * @package Intafaced_Pay
 */

declare(strict_types=1);

final class Intafaced_Pay_Webhook {
	public static function register(): void {
		add_action('rest_api_init', array(self::class, 'register_route'));
	}

	public static function register_route(): void {
		register_rest_route(
			'intafaced-pay/v1',
			'/webhook',
			array(
				'methods'             => 'POST',
				'callback'            => array(self::class, 'handle'),
				'permission_callback' => '__return_true',
			)
		);
	}

	public static function handle(WP_REST_Request $request): WP_REST_Response {
		$settings = get_option('woocommerce_intafaced_pay_settings', array());
		$secret = is_array($settings) ? (string) ($settings['webhook_secret'] ?? '') : '';
		$raw = $request->get_body();
		$signature = $request->get_header(Intafaced_Pay_Contract::HEADER_SIGNATURE);
		$timestamp = $request->get_header(Intafaced_Pay_Contract::HEADER_TIMESTAMP);
		$ok = Intafaced_Pay_Contract::verify_merchant_webhook(
			$secret,
			$raw,
			is_string($signature) ? $signature : null,
			is_string($timestamp) ? $timestamp : null
		);
		if (!$ok) {
			return new WP_REST_Response(array('ok' => false, 'error' => 'invalid_signature'), 401);
		}

		$payload = json_decode($raw, true);
		if (!is_array($payload)) {
			return new WP_REST_Response(array('ok' => false, 'error' => 'invalid_json'), 400);
		}

		$type = (string) ($payload['type'] ?? '');
		$data = is_array($payload['data'] ?? null) ? $payload['data'] : array();
		$payment_id = (string) ($data['id'] ?? '');
		if ($payment_id === '') {
			return new WP_REST_Response(array('ok' => true, 'ignored' => true), 200);
		}

		$order = self::find_order($payment_id);
		if (!$order) {
			return new WP_REST_Response(array('ok' => true, 'ignored' => 'unknown_payment'), 200);
		}

		if ($type === 'payment.captured') {
			$order->payment_complete($payment_id);
			$order->add_order_note('INTAFACED payment captured.');
		} elseif ($type === 'payment.failed') {
			$order->update_status('failed', 'INTAFACED payment failed.');
		} elseif ($type === 'payment.refunded') {
			$order->update_status('refunded', 'INTAFACED payment refunded.');
		}

		return new WP_REST_Response(array('ok' => true), 200);
	}

	private static function find_order(string $payment_id): ?WC_Order {
		$orders = wc_get_orders(
			array(
				'limit'      => 1,
				'meta_key'   => '_intafaced_payment_id',
				'meta_value' => $payment_id,
			)
		);
		if (!is_array($orders) || $orders === []) {
			return null;
		}
		$first = $orders[0];
		return $first instanceof WC_Order ? $first : null;
	}
}
