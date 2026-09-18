/**
 * HTTP JobHost mutate doors always bind retained bytes.
 * Compose INTERNAL_SERVICE_BODY_BIND does not weaken this mill.
 */
import { verifyServiceHeaders, type ServiceRawBody } from '@intafaced/contracts';

export function requireInternalJobHmac(
  headers: Record<string, string | string[] | undefined>,
  secret: string,
  rawBody: ServiceRawBody,
): boolean {
  return verifyServiceHeaders(headers, secret, { rawBody, mode: 'require' }).service !== null;
}
