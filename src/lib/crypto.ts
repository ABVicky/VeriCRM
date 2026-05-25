import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // For GCM, 12 bytes is standard
const AUTH_TAG_LENGTH = 16;

// Derive a 32-byte key from our environment secret
function getEncryptionKey(): Buffer {
  const secret = process.env.SHOPIFY_ENCRYPTION_KEY;
  if (!secret) {
    // Return a fallback only for development warnings, but fail in production
    if (process.env.NODE_ENV === "production") {
      throw new Error("SHOPIFY_ENCRYPTION_KEY environment variable is not set.");
    }
    // Fallback key for dev
    return crypto.scryptSync("fallback-secret-key-12345", "salt", 32);
  }
  return crypto.scryptSync(secret, "shopify-salt", 32);
}

/**
 * Encrypts cleartext using AES-256-GCM
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getEncryptionKey();
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Return composite string: iv:encrypted:authTag
  return `${iv.toString("hex")}:${encrypted}:${authTag.toString("hex")}`;
}

/**
 * Decrypts encrypted string composite back to cleartext
 */
export function decrypt(encryptedText: string): string {
  const parts = encryptedText.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted format. Expected iv:encrypted:authTag");
  }

  const [ivHex, encryptedHex, authTagHex] = parts;
  if (!ivHex || !encryptedHex || !authTagHex) {
    throw new Error("Invalid encrypted contents.");
  }

  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const key = getEncryptionKey();

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted.toString("hex"), "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}
