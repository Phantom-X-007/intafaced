/**
 * The rail layer (§6.1, Doctrine §0.4).
 *
 * Everything external to svc-pay enters through here and nowhere else. The core
 * imports `RailAdapter` and `RailRegistry`; it never imports a concrete adapter,
 * which is what keeps §6.1's "drop in later with zero core changes" true rather
 * than aspirational.
 */
export * from './rail-adapter.js';
export * from './registry.js';
export * from './chain-port.js';
export * from './crypto-native.js';
export * from './card-sandbox.js';
export { signPayload, verifySignature, type SignatureCheck } from './webhook-signature.js';
export { runRailAdapterConformance, type RailHarness } from './conformance.js';
