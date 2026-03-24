import { secp256k1 } from "@noble/curves/secp256k1.js";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { strip0x, bytesToHex, hexToBytes, concatBytes } from "./bytes";

// -- Address derivation --

/**
 * Derive a Tron address (T...) from an EVM address (0x...).
 * Both chains use secp256k1; the only difference is the address encoding.
 * Tron = base58check( 0x41 + last20bytes(keccak256(pubkey)) )
 * Since the last 20 bytes are the same as the EVM address, we just re-encode.
 */
export function deriveTronAddress(evmAddress: string): string {
  const addressBytes = hexToBytes(strip0x(evmAddress));
  // Prepend 0x41 (TRON mainnet prefix)
  const payload = new Uint8Array(21);
  payload[0] = 0x41;
  payload.set(addressBytes, 1);
  return base58CheckEncode(payload);
}

/**
 * Base58Check encode: payload → base58(payload + sha256(sha256(payload))[0:4])
 */
function base58CheckEncode(payload: Uint8Array): string {
  const checksum = sha256(sha256(payload)).slice(0, 4);
  const withChecksum = concatBytes(payload, checksum);
  return bs58.encode(withChecksum);
}

// -- Signing --

/**
 * Sign a message using the Tron message prefix.
 *
 * Computes: keccak256( "\x19TRON Signed Message:\n" + len(messageBytes) + messageBytes )
 *
 * Returns the 32-byte hex digest to be signed with signRawMessage.
 */
export function tronMessageDigest(message: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const prefix = new TextEncoder().encode("\x19TRON Signed Message:\n");
  const lengthStr = new TextEncoder().encode(String(messageBytes.length));
  const digest = keccak_256(concatBytes(prefix, lengthStr, messageBytes));
  return bytesToHex(digest);
}

// -- Balance --

const TRON_API = "https://nile.trongrid.io";

/**
 * Query TRX balance via TronGrid REST API.
 * Returns human-readable string in TRX (SUN / 1e6).
 */
export async function getTronBalance(tronAddress: string): Promise<string> {
  try {
    const res = await fetch(`${TRON_API}/v1/accounts/${tronAddress}`);
    if (!res.ok) return "0";
    const data = await res.json();
    if (!data.data?.[0]?.balance) return "0";
    return (Number(data.data[0].balance) / 1_000_000).toString();
  } catch {
    return "0";
  }
}

// -- Transfer --

/**
 * Send TRX via TronGrid REST API.
 * 1. POST /wallet/createtransaction → unsigned tx with txID
 * 2. Sign txID with signRawMessage
 * 3. POST /wallet/broadcasttransaction
 * Returns transaction ID.
 */
export async function sendTronTransfer(
  to: string,
  amountTrx: number,
  fromTronAddress: string,
  signRawFn: (digest: string) => Promise<string>,
): Promise<string> {
  const amountSun = Math.round(amountTrx * 1_000_000);

  // Convert TRON base58 addresses to hex for the API
  const toHex = tronAddressToHex(to);
  const fromHex = tronAddressToHex(fromTronAddress);

  // 1. Create unsigned transaction
  const createRes = await fetch(`${TRON_API}/wallet/createtransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to_address: toHex,
      owner_address: fromHex,
      amount: amountSun,
      visible: false,
    }),
  });
  if (!createRes.ok) {
    throw new Error(`Failed to create transaction: ${createRes.status}`);
  }
  const unsignedTx = await createRes.json();
  if (!unsignedTx.txID) {
    throw new Error(unsignedTx.Error || "Failed to create transaction");
  }

  // 2. Sign the txID (already 64-char hex = 32 bytes)
  const signature = await signRawFn(unsignedTx.txID);

  // 3. Broadcast
  const broadcastRes = await fetch(`${TRON_API}/wallet/broadcasttransaction`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...unsignedTx,
      signature: [strip0x(signature)],
    }),
  });
  if (!broadcastRes.ok) {
    throw new Error(`Broadcast failed: ${broadcastRes.status}`);
  }
  const result = await broadcastRes.json();
  if (!result.result) {
    throw new Error(result.message || "Broadcast failed");
  }
  return unsignedTx.txID;
}

/**
 * Convert a TRON base58check address to hex (41-prefixed).
 */
function tronAddressToHex(address: string): string {
  const decoded = bs58.decode(address);
  // Remove 4-byte checksum
  const payload = decoded.slice(0, decoded.length - 4);
  return bytesToHex(payload);
}

// -- Verification --

/**
 * Verify a Tron message signature by recovering the signer's address.
 * Returns the recovered TRON address (T...).
 */
export function verifyTronSignature(
  message: string,
  signature: string,
): string {
  const digest = hexToBytes(tronMessageDigest(message));

  const sigBytes = hexToBytes(strip0x(signature));
  const rsHex = bytesToHex(sigBytes.slice(0, 64));
  let v = sigBytes[64];
  if (v >= 27) v -= 27;

  const sig = secp256k1.Signature.fromHex(rsHex).addRecoveryBit(v);
  const recoveredPubkey = sig.recoverPublicKey(digest);

  // Derive EVM address from uncompressed pubkey
  const uncompressed = recoveredPubkey.toBytes(false);
  const addressHash = keccak_256(uncompressed.slice(1));
  const evmAddress = "0x" + bytesToHex(addressHash.slice(12));

  // Convert to TRON address
  return deriveTronAddress(evmAddress);
}
