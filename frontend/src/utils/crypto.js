/**
 * TrustVault Client-Side Cryptographic Decryption Engine
 * Implements in-browser document decryption using standard Web Crypto API:
 * - 256-bit AES-GCM decryption
 * - 96-bit IV and 128-bit authentication tag verification
 * - Transient in-memory buffer clearing
 * - Zero persistence in localStorage, sessionStorage, or IndexedDB
 */

/**
 * Convert a hexadecimal string to Uint8Array
 */
export function hexToUint8Array(hex) {
  if (typeof hex !== "string" || hex.length % 2 !== 0) {
    throw new TypeError("Invalid hexadecimal string");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Convert a Base64 string to Uint8Array
 */
export function base64ToUint8Array(base64) {
  if (typeof base64 !== "string") {
    throw new TypeError("Invalid base64 string");
  }
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Check if the browser environment supports Web Crypto API SubtleCrypto
 */
export function isWebCryptoSupported() {
  return typeof window !== "undefined" && Boolean(window.crypto?.subtle);
}

/**
 * Decrypt an AES-256-GCM encrypted document payload directly in the browser.
 * Web Crypto API AES-GCM expects the authentication tag to be appended directly
 * to the ciphertext payload for verification.
 *
 * @param {Object} params
 * @param {string} params.dekHex - 32-byte hexadecimal Data Encryption Key released by backend
 * @param {string} params.ivHex - 12-byte hexadecimal Initialization Vector / Nonce
 * @param {string} params.authTagHex - 16-byte hexadecimal AES-GCM Authentication Tag
 * @param {string} params.ciphertextBase64 - Base64-encoded encrypted document bytes
 * @returns {Promise<ArrayBuffer>} Decrypted document plaintext bytes
 */
export async function decryptDocumentInBrowser({ dekHex, ivHex, authTagHex, ciphertextBase64 }) {
  if (!isWebCryptoSupported()) {
    throw new Error("Web Crypto API is not supported in this browser environment.");
  }

  if (!dekHex || !ivHex || !authTagHex || !ciphertextBase64) {
    throw new Error("Missing required decryption parameters (DEK, IV, AuthTag, or Ciphertext).");
  }

  let dekBytes = null;
  let ivBytes = null;
  let authTagBytes = null;
  let ciphertextBytes = null;
  let combinedPayload = null;

  try {
    dekBytes = hexToUint8Array(dekHex);
    ivBytes = hexToUint8Array(ivHex);
    authTagBytes = hexToUint8Array(authTagHex);
    ciphertextBytes = base64ToUint8Array(ciphertextBase64);

    if (dekBytes.length !== 32) {
      throw new Error(`Invalid DEK length: expected 32 bytes, received ${dekBytes.length}`);
    }
    if (ivBytes.length !== 12) {
      throw new Error(`Invalid IV length: expected 12 bytes, received ${ivBytes.length}`);
    }
    if (authTagBytes.length !== 16) {
      throw new Error(`Invalid AuthTag length: expected 16 bytes, received ${authTagBytes.length}`);
    }

    // Web Crypto API expects: [ciphertext ... authenticationTag]
    combinedPayload = new Uint8Array(ciphertextBytes.length + authTagBytes.length);
    combinedPayload.set(ciphertextBytes, 0);
    combinedPayload.set(authTagBytes, ciphertextBytes.length);

    // Import DEK as an unextractable CryptoKey (extractable: false prevents script key export)
    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      dekBytes.buffer,
      { name: "AES-GCM" },
      false,
      ["decrypt"]
    );

    // Decrypt and authenticate
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: ivBytes.buffer,
        tagLength: 128
      },
      cryptoKey,
      combinedPayload.buffer
    );

    return decryptedBuffer;
  } catch (error) {
    if (error.name === "OperationError") {
      throw new Error("Document decryption failed: Authentication tag verification failed or ciphertext was tampered with.");
    }
    throw error;
  } finally {
    // Proactively zero out transient key material buffers in memory
    if (dekBytes) dekBytes.fill(0);
    if (combinedPayload) combinedPayload.fill(0);
  }
}
