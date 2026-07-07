import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

// Retrieves the encryption key from your local .env file
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

/**
 * Encrypts a raw text string (like an API key) into a secure string.
 */
export function encrypt(plaintext: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }

  const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag().toString('base64');

  // Format: iv:authTag:encryptedData inside a single string payload
  return `${iv.toString('base64')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted string payload back into plain text.
 */
export function decrypt(payload: string): string {
  if (!ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is missing.');
  }

  const [ivBase64, authTagBase64, encryptedDataBase64] = payload.split(':');
  if (!ivBase64 || !authTagBase64 || !encryptedDataBase64) {
    throw new Error('Invalid encrypted credentials payload format.');
  }

  const keyBuffer = Buffer.from(ENCRYPTION_KEY, 'hex');
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);

  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedDataBase64, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

/**
 * Masks a secret key for visual dashboard safety (e.g., sk-p****z9k1)
 */
export function maskSecret(raw: string): string {
  if (!raw) return '';
  if (raw.length <= 8) return '****';
  return `${raw.substring(0, 4)}****${raw.substring(raw.length - 4)}`;
}