import crypto from 'crypto';

/**
 * Validates an HMAC-SHA256 signature using the raw request body.
 * We use timingSafeEqual to avoid timing attacks.
 */
export function verifyHmac(rawBody: string, signature: string | null, secret: string | undefined): boolean {
  if (!signature || !secret) return false;

  const computed = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest();

  let provided: Buffer;
  try {
    provided = Buffer.from(signature, 'hex');
  } catch {
    return false;
  }

  if (provided.length !== computed.length) return false;

  return crypto.timingSafeEqual(computed, provided);
}
