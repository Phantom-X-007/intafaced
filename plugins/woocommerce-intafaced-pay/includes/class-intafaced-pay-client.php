<?php
/**
 * HTTP sender for the INTAFACED public payments API.
 *
 * @package Intafaced_Pay
 */

declare(strict_types=1);

final class Intafaced_Pay_Client {
	public function __construct(
		private readonly string $base_url,
		private readonly string $api_key
	) {}

	/**
	 * @param array{method:string,path:string,headers:array<string,string>,body?:string} $request
	 * @return array{status:int,body:mixed}
	 */
	public function send(array $request): array {
		$url = Intafaced_Pay_Contract::absolute_url($this->base_url, $request['path']);
		$args = array(
			'method'  => $request['method'],
			'timeout' => 30,
			'headers' => $request['headers'],
		);
		if (isset($request['body'])) {
			$args['body'] = $request['body'];
		}
		$response = wp_remote_request($url, $args);
		if (is_wp_error($response)) {
			throw new RuntimeException('INTAFACED Pay: request failed');
		}
		$status = (int) wp_remote_retrieve_response_code($response);
		$raw = (string) wp_remote_retrieve_body($response);
		$decoded = json_decode($raw, true);
		return array(
			'status' => $status,
			'body'   => json_last_error() === JSON_ERROR_NONE ? $decoded : $raw,
		);
	}

	/**
	 * @param array{merchantId:string,amount:string,assetId:string,method:string,metadata?:array<string,mixed>} $body
	 * @return array{status:int,body:mixed}
	 */
	public function create_payment(array $body, string $idempotency_key): array {
		$built = Intafaced_Pay_Contract::build_create_payment_request($this->api_key, $body, $idempotency_key);
		return $this->send($built);
	}
}
