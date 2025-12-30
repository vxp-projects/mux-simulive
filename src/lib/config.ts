/**
 * Application Configuration
 * Only contains Mux API credentials from environment
 */

export function getMuxConfig() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    console.error("MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set");
    return null;
  }

  return { tokenId, tokenSecret };
}

export function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export function isMuxConfigured(): boolean {
  return !!(process.env.MUX_TOKEN_ID && process.env.MUX_TOKEN_SECRET);
}

export function getSigningKeys() {
  const keyId = process.env.MUX_SIGNING_KEY;
  const privateKey = process.env.MUX_PRIVATE_KEY;

  if (!keyId || !privateKey) {
    return null;
  }

  return { keyId, privateKey };
}

export function isSigningConfigured(): boolean {
  return !!(process.env.MUX_SIGNING_KEY && process.env.MUX_PRIVATE_KEY);
}
