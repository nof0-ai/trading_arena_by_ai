// Client-side encryption utilities for private keys
// Uses Web Crypto API for secure encryption

/**
 * Derives an encryption key from a password using PBKDF2
 * @param password - User's password
 * @param salt - Salt for key derivation (hex string)
 * @returns CryptoKey for AES-GCM encryption
 */
export async function deriveKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const encoder = new TextEncoder()
  const passwordBuffer = encoder.encode(password)

  // Import password as key material
  const keyMaterial = await crypto.subtle.importKey("raw", passwordBuffer, "PBKDF2", false, ["deriveBits", "deriveKey"])

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000, // High iteration count for security
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  )
}

/**
 * Encrypts a private key using AES-GCM
 * @param privateKey - The private key to encrypt
 * @param password - User's password
 * @returns Object containing encrypted data, salt, and IV
 */
export async function encryptPrivateKey(
  privateKey: string,
  password: string,
): Promise<{ encrypted: string; salt: string; iv: string }> {
  // Generate random salt and IV
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))

  // Derive encryption key from password
  const key = await deriveKey(password, salt)

  // Encrypt the private key
  const encoder = new TextEncoder()
  const data = encoder.encode(privateKey)
  const encryptedBuffer = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, data)

  // Convert to hex strings for storage
  return {
    encrypted: bufferToHex(new Uint8Array(encryptedBuffer)),
    salt: bufferToHex(salt),
    iv: bufferToHex(iv),
  }
}

/**
 * Decrypts a private key using AES-GCM
 * @param encrypted - Encrypted private key (hex string)
 * @param password - User's password
 * @param salt - Salt used for encryption (hex string)
 * @param iv - IV used for encryption (hex string)
 * @returns Decrypted private key
 */
export async function decryptPrivateKey(
  encrypted: string,
  password: string,
  salt: string,
  iv: string,
): Promise<string> {
  // Convert hex strings back to Uint8Arrays
  const saltBuffer = hexToBuffer(salt)
  const ivBuffer = hexToBuffer(iv)
  const encryptedBuffer = hexToBuffer(encrypted)

  // Derive the same key from password and salt
  const key = await deriveKey(password, saltBuffer)

  // Decrypt the data
  const decryptedBuffer = await crypto.subtle.decrypt({ name: "AES-GCM", iv: ivBuffer }, key, encryptedBuffer)

  // Convert back to string
  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

// Helper functions for hex conversion
function bufferToHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

function hexToBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = Number.parseInt(hex.substr(i, 2), 16)
  }
  return bytes
}

/**
 * Validates if a string is a valid Ethereum private key
 */
export function isValidPrivateKey(key: string): boolean {
  // Remove 0x prefix if present
  const cleanKey = key.startsWith("0x") ? key.slice(2) : key
  // Check if it's 64 hex characters
  return /^[0-9a-fA-F]{64}$/.test(cleanKey)
}
