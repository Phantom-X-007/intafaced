import {
  buildCreatePaymentRequest,
  buildRefundRequest,
  signMerchantWebhook,
  verifyMerchantWebhook,
  type CreatePaymentBody,
  type PayPluginClientOptions,
  type PluginRequest,
} from './reference-client.js';

export type ReferenceCmsFamily = 'woocommerce' | 'magento' | 'opencart';

export interface ReferenceCmsAdapter {
  readonly family: ReferenceCmsFamily;
  readonly language: 'typescript';
  createPayment(options: PayPluginClientOptions, body: CreatePaymentBody, idempotencyKey: string): PluginRequest;
  refund(options: PayPluginClientOptions, paymentId: string, amount: string, idempotencyKey: string): PluginRequest;
  signWebhook(secret: string, timestampSeconds: string, rawBody: string): string;
  verifyWebhook(input: Parameters<typeof verifyMerchantWebhook>[0]): boolean;
}

function adapter(family: ReferenceCmsFamily): ReferenceCmsAdapter {
  return {
    family,
    language: 'typescript',
    createPayment: (options, body, idempotencyKey) =>
      buildCreatePaymentRequest(options, { ...body, metadata: { ...body.metadata, cms: family } }, idempotencyKey),
    refund: (options, paymentId, amount, idempotencyKey) => buildRefundRequest(options, paymentId, { amount }, idempotencyKey),
    signWebhook: signMerchantWebhook,
    verifyWebhook: verifyMerchantWebhook,
  };
}

export const woocommerceAdapter = adapter('woocommerce');
export const magentoAdapter = adapter('magento');
export const opencartAdapter = adapter('opencart');
export const REFERENCE_CMS_ADAPTERS = [woocommerceAdapter, magentoAdapter, opencartAdapter] as const;

export function listReferenceCmsAdapters(): readonly ReferenceCmsFamily[] {
  return REFERENCE_CMS_ADAPTERS.map((item) => item.family);
}
