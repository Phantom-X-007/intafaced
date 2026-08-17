<?php
/**
 * WooCommerce payment gateway — talks only to the INTAFACED public API.
 *
 * @package Intafaced_Pay
 */

declare(strict_types=1);

final class Intafaced_Pay_Gateway extends WC_Payment_Gateway {
	public function __construct() {
		$this->id                 = 'intafaced_pay';
		$this->method_title       = 'INTAFACED Pay';
		$this->method_description = 'Accept payments at WooCommerce checkout through the INTAFACED public payments API.';
		$this->has_fields         = false;
		$this->supports           = array('products');

		$this->init_form_fields();
		$this->init_settings();

		$this->title       = $this->get_option('title', 'INTAFACED Pay');
		$this->description = $this->get_option('description', 'Pay securely via INTAFACED.');
		$this->enabled     = $this->get_option('enabled', 'no');

		add_action('woocommerce_update_options_payment_gateways_' . $this->id, array($this, 'process_admin_options'));
	}

	public function init_form_fields(): void {
		$this->form_fields = array(
			'enabled' => array(
				'title'   => 'Enable',
				'type'    => 'checkbox',
				'label'   => 'Enable INTAFACED Pay',
				'default' => 'no',
			),
			'title' => array(
				'title'   => 'Title',
				'type'    => 'text',
				'default' => 'INTAFACED Pay',
			),
			'description' => array(
				'title'   => 'Description',
				'type'    => 'textarea',
				'default' => 'Pay securely via INTAFACED.',
			),
			'origin' => array(
				'title'       => 'API origin',
				'type'        => 'text',
				'description' => 'Edge origin with no trailing slash, e.g. https://pay.example.com',
				'default'     => '',
			),
			'api_key' => array(
				'title'       => 'API key',
				'type'        => 'password',
				'description' => 'Sandbox keys start with ifc_test_. Live keys start with ifc_.',
				'default'     => '',
			),
			'key_mode' => array(
				'title'   => 'Key mode',
				'type'    => 'select',
				'default' => 'sandbox',
				'options' => array(
					'sandbox' => 'Sandbox',
					'live'    => 'Live',
				),
			),
			'merchant_id' => array(
				'title'   => 'Merchant id',
				'type'    => 'text',
				'default' => '',
			),
			'asset_id' => array(
				'title'   => 'Asset id',
				'type'    => 'text',
				'default' => 'USDT',
			),
			'method' => array(
				'title'   => 'Payment method',
				'type'    => 'select',
				'default' => 'crypto',
				'options' => array(
					'crypto' => 'Crypto',
					'card'   => 'Card',
				),
			),
			'webhook_secret' => array(
				'title'       => 'Webhook secret',
				'type'        => 'password',
				'description' => 'Shared secret for X-Intafaced-Signature verification.',
				'default'     => '',
			),
		);
	}

	/**
	 * @param int $order_id
	 * @return array{result:string,redirect?:string,messages?:string}
	 */
	public function process_payment($order_id): array {
		$order = wc_get_order($order_id);
		if (!$order) {
			wc_add_notice('INTAFACED Pay: order not found.', 'error');
			return array('result' => 'fail');
		}

		$api_key = (string) $this->get_option('api_key');
		$key_mode = (string) $this->get_option('key_mode', 'sandbox');
		try {
			Intafaced_Pay_Contract::assert_key_mode($api_key, $key_mode);
			$amount = (string) $order->get_total();
			Intafaced_Pay_Contract::assert_decimal_amount($amount);
			$client = new Intafaced_Pay_Client((string) $this->get_option('origin'), $api_key);
			$result = $client->create_payment(
				array(
					'merchantId' => (string) $this->get_option('merchant_id'),
					'amount'     => $amount,
					'assetId'    => (string) $this->get_option('asset_id', 'USDT'),
					'method'     => (string) $this->get_option('method', 'crypto'),
					'metadata'   => array(
						'woocommerce_order_id' => (string) $order->get_id(),
					),
				),
				'wc-order-' . $order->get_id()
			);
		} catch (Throwable $e) {
			wc_add_notice('INTAFACED Pay: could not create payment.', 'error');
			return array('result' => 'fail');
		}

		if ($result['status'] < 200 || $result['status'] >= 300) {
			wc_add_notice('INTAFACED Pay: payment was refused.', 'error');
			return array('result' => 'fail');
		}

		$body = is_array($result['body']) ? $result['body'] : array();
		$payment_id = isset($body['id']) && is_string($body['id']) ? $body['id'] : '';
		if ($payment_id === '') {
			wc_add_notice('INTAFACED Pay: payment id missing.', 'error');
			return array('result' => 'fail');
		}

		$order->update_meta_data('_intafaced_payment_id', $payment_id);
		$order->update_status('on-hold', 'Awaiting INTAFACED payment capture.');
		$order->save();
		WC()->cart->empty_cart();

		return array(
			'result'   => 'success',
			'redirect' => $this->get_return_url($order),
		);
	}
}
