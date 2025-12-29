/**
 * Application Configuration
 * Only contains Mux API credentials from environment
 */

export function getMuxConfig() {
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;

  if (!tokenId || !tokenSecret) {
    throw new Error(
      "MUX_TOKEN_ID and MUX_TOKEN_SECRET must be set in environment variables"
    );
  }

  return { tokenId, tokenSecret };
}

export function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}
