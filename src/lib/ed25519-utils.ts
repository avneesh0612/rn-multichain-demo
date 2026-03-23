import bs58 from "bs58";
import { strip0x, hexToBytes } from "./bytes";

/**
 * Decode a Solana base58 address into a 32-byte Ed25519 public key.
 */
export function solanaAddressToPubkey(solanaAddress: string): Uint8Array {
  const decoded = bs58.decode(solanaAddress);
  if (decoded.length !== 32) {
    throw new Error(
      `Expected 32-byte Ed25519 pubkey, got ${decoded.length} bytes`,
    );
  }
  return decoded;
}

/**
 * Decode an Ed25519 signature from hex, base64, or base58.
 * Tries each encoding and returns the first that yields exactly 64 bytes.
 */
export function decodeSig(sig: string): Uint8Array {
  const cleaned = strip0x(sig.trim());

  // Try hex (128 hex chars = 64 bytes)
  if (/^[0-9a-fA-F]+$/.test(cleaned) && cleaned.length === 128) {
    return hexToBytes(cleaned);
  }

  // Try base64
  try {
    const binary = atob(cleaned);
    if (binary.length === 64) {
      const bytes = new Uint8Array(64);
      for (let i = 0; i < 64; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
  } catch {
    // not valid base64
  }

  // Try base58
  try {
    const decoded = bs58.decode(cleaned);
    if (decoded.length === 64) return decoded;
  } catch {
    // not valid base58
  }

  throw new Error(
    `Cannot decode signature: expected 64 bytes (hex/base64/base58), got ${cleaned.length} chars`,
  );
}
