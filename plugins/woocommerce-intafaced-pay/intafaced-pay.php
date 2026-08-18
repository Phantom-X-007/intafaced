<?php
/**
 * Plugin Name: INTAFACED Pay
 * Plugin URI: https://github.com/Phantom-X-007/intafaced
 * Description: WooCommerce checkout adapter for the INTAFACED public payments API. Amounts are decimal strings; webhooks use HMAC-SHA256.
 * Version: 0.1.0
 * Requires at least: 6.2
 * Requires PHP: 8.1
 * Requires Plugins: woocommerce
 * Author: INTAFACED
 * License: Proprietary
 * Text Domain: intafaced-pay
 *
 * @package Intafaced_Pay
 */

declare(strict_types=1);

defined('ABSPATH') || exit;

define('INTAFACED_PAY_FILE', __FILE__);
define('INTAFACED_PAY_DIR', plugin_dir_path(__FILE__));

add_action('plugins_loaded', 'intafaced_pay_boot', 11);

function intafaced_pay_boot(): void {
	if (!class_exists('WC_Payment_Gateway')) {
		return;
	}
	require_once INTAFACED_PAY_DIR . 'includes/class-intafaced-pay-contract.php';
	require_once INTAFACED_PAY_DIR . 'includes/class-intafaced-pay-client.php';
	require_once INTAFACED_PAY_DIR . 'includes/class-intafaced-pay-gateway.php';
	require_once INTAFACED_PAY_DIR . 'includes/class-intafaced-pay-webhook.php';
	add_filter('woocommerce_payment_gateways', 'intafaced_pay_register_gateway');
	Intafaced_Pay_Webhook::register();
}

/**
 * @param array<int, class-string> $gateways
 * @return array<int, class-string>
 */
function intafaced_pay_register_gateway(array $gateways): array {
	$gateways[] = Intafaced_Pay_Gateway::class;
	return $gateways;
}
