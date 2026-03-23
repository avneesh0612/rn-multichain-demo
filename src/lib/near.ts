import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes } from "./bytes";
import { solanaAddressToPubkey, decodeSig } from "./ed25519-utils";

// -- Address derivation --

/**
 * Derive a NEAR implicit account ID from a Solana address.
 * Both chains use Ed25519; NEAR implicit accounts are the hex-encoded 32-byte pubkey.
 */
export function deriveNearAddress(solanaAddress: string): string {
  const pubkey = solanaAddressToPubkey(solanaAddress);
  return bytesToHex(pubkey);
}

// -- Signing --

/**
 * Compute the NEAR message digest for signing.
 *
 * SHA-256( "\x19NEAR Signed Message:\n" + len(messageBytes) + messageBytes )
 *
 * Returns the hex-encoded 32-byte digest to pass to signMessage.
 */
export function nearMessageDigest(message: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode("\x19NEAR Signed Message:\n");
  const lengthStr = new TextEncoder().encode(String(messageBytes.length));

  const toHash = concatBytes(prefix, lengthStr, messageBytes);
  const digest = sha256(toHash);
  return bytesToHex(digest);
}

// -- Verification --

/**
 * Verify a NEAR message signature.
 * Recomputes the SHA-256 hash and verifies the Ed25519 signature.
 */
export function verifyNearSignature(
  message: string,
  signature: string,
  solanaAddress: string,
): boolean {
  const pubkey = solanaAddressToPubkey(solanaAddress);

  const messageBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode("\x19NEAR Signed Message:\n");
  const lengthStr = new TextEncoder().encode(String(messageBytes.length));

  const toHash = concatBytes(prefix, lengthStr, messageBytes);
  const digest = sha256(toHash);
  const sigBytes = decodeSig(signature);

  return ed25519.verify(sigBytes, digest, pubkey);
}
