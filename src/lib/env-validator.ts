/**
 * Validates that all required server-side and client-side environment variables
 * are set and properly formatted.
 */
export function validateEnv() {
  const isProd = process.env.NODE_ENV === "production";

  const requiredServerVars = [
    "FIREBASE_PROJECT_ID",
    "FIREBASE_CLIENT_EMAIL",
    "FIREBASE_PRIVATE_KEY",
    "SHOPIFY_ENCRYPTION_KEY",
    "SHOPIFY_WEBHOOK_SECRET",
  ];

  const requiredPublicVars = [
    "NEXT_PUBLIC_FIREBASE_API_KEY",
    "NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN",
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID",
    "NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET",
    "NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID",
    "NEXT_PUBLIC_FIREBASE_APP_ID",
  ];

  const missing: string[] = [];

  // Check public variables
  for (const v of requiredPublicVars) {
    if (!process.env[v]) {
      missing.push(v);
    }
  }

  // Check server-side variables
  for (const v of requiredServerVars) {
    if (!process.env[v]) {
      // In production, we strictly require all variables. In development, we can tolerate defaults or log warnings.
      if (isProd || v !== "SHOPIFY_WEBHOOK_SECRET") {
        missing.push(v);
      }
    }
  }

  if (missing.length > 0) {
    const errorMsg = `Environment configuration error: Missing required variables [${missing.join(", ")}]. Check your .env file or Vercel environment settings.`;
    console.error(errorMsg);
    throw new Error(errorMsg);
  }

  // Validate Shopify encryption key length
  const encryptionKey = process.env.SHOPIFY_ENCRYPTION_KEY;
  if (encryptionKey && encryptionKey.length < 16) {
    const errorMsg = "SHOPIFY_ENCRYPTION_KEY must be a secure secret (at least 16 characters, preferably 32 characters for AES-256).";
    console.error(errorMsg);
    throw new Error(errorMsg);
  }
}
