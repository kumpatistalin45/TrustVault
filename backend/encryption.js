
const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey() {
  const keyHex = process.env.FILE_ENCRYPTION_KEY;

  if (
    typeof keyHex !== "string" ||
    !/^[a-fA-F0-9]{64}$/.test(keyHex)
  ) {
    throw new Error(
      "FILE_ENCRYPTION_KEY must be a 32-byte hexadecimal key"
    );
  }

  return Buffer.from(keyHex, "hex");
}

function encryptBuffer(plaintext) {
  if (!Buffer.isBuffer(plaintext)) {
    throw new TypeError("Plaintext must be a Buffer");
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    getEncryptionKey(),
    iv
  );

  const ciphertext = Buffer.concat([
    cipher.update(plaintext),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    version: 1,
    iv: iv.toString("hex"),
    authTag: authTag.toString("hex"),
    ciphertext
  };
}

function decryptBuffer(encrypted) {
  if (
    !encrypted ||
    encrypted.version !== 1 ||
    !/^[a-fA-F0-9]{24}$/.test(encrypted.iv || "") ||
    !/^[a-fA-F0-9]{32}$/.test(encrypted.authTag || "") ||
    !Buffer.isBuffer(encrypted.ciphertext)
  ) {
    throw new Error("Invalid encrypted file format");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(encrypted.iv, "hex")
  );

  decipher.setAuthTag(
    Buffer.from(encrypted.authTag, "hex")
  );

  // Authentication failure throws; do not return partial plaintext.
  return Buffer.concat([
    decipher.update(encrypted.ciphertext),
    decipher.final()
  ]);
}

module.exports = {
  encryptBuffer,
  decryptBuffer
};
