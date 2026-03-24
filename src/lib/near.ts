import { ed25519 } from "@noble/curves/ed25519.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
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

// -- RPC helper --

const NEAR_RPC = "https://rpc.testnet.near.org";

async function nearRpc(method: string, params: unknown): Promise<unknown> {
  const res = await fetch(NEAR_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "1", method, params }),
  });
  if (!res.ok) throw new Error(`NEAR RPC HTTP error: ${res.status}`);
  const data = await res.json();
  if (data.error) {
    throw new Error(
      data.error.data || data.error.message || JSON.stringify(data.error),
    );
  }
  return data.result;
}

// -- Balance --

/**
 * Query NEAR balance via JSON-RPC.
 * Returns human-readable string in NEAR (yoctoNEAR / 1e24).
 */
export async function getNearBalance(accountId: string): Promise<string> {
  try {
    const result = (await nearRpc("query", {
      request_type: "view_account",
      finality: "final",
      account_id: accountId,
    })) as { amount: string };
    const yocto = BigInt(result.amount);
    const divisor = BigInt(10) ** BigInt(24);
    const whole = yocto / divisor;
    const frac = yocto % divisor;
    const fracStr = frac.toString().padStart(24, "0").replace(/0+$/, "");
    if (fracStr.length === 0) return whole.toString();
    return `${whole}.${fracStr}`;
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("does not exist") ||
        err.message.includes("UNKNOWN_ACCOUNT"))
    ) {
      return "0";
    }
    throw err;
  }
}

// -- Transfer (Borsh serialization) --

function borshU8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

function borshU32(value: number): Uint8Array {
  const buf = new Uint8Array(4);
  buf[0] = value & 0xff;
  buf[1] = (value >>> 8) & 0xff;
  buf[2] = (value >>> 16) & 0xff;
  buf[3] = (value >>> 24) & 0xff;
  return buf;
}

function borshU64(value: bigint): Uint8Array {
  const buf = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    buf[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
  }
  return buf;
}

function borshU128(value: bigint): Uint8Array {
  const buf = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    buf[i] = Number((value >> BigInt(i * 8)) & BigInt(0xff));
  }
  return buf;
}

function borshString(s: string): Uint8Array {
  const encoded = new TextEncoder().encode(s);
  const len = borshU32(encoded.length);
  const result = new Uint8Array(len.length + encoded.length);
  result.set(len, 0);
  result.set(encoded, len.length);
  return result;
}

/**
 * Send NEAR from the derived implicit account.
 * Returns the transaction hash.
 */
export async function sendNearTransfer(
  recipient: string,
  amountNear: number,
  nearAddress: string,
  solanaAddress: string,
  signFn: (hexDigest: string) => Promise<string>,
): Promise<string> {
  const pubkey = solanaAddressToPubkey(solanaAddress);

  // Convert NEAR to yoctoNEAR
  const [wholePart, fracPart = ""] = amountNear.toString().split(".");
  const paddedFrac = fracPart.padEnd(24, "0").slice(0, 24);
  const amountYocto = BigInt(wholePart + paddedFrac);

  // Fetch access key and recent block hash
  const [accessKeyResult, blockResult] = await Promise.all([
    nearRpc("query", {
      request_type: "view_access_key",
      finality: "final",
      account_id: nearAddress,
      public_key: `ed25519:${bs58.encode(pubkey)}`,
    }) as Promise<{ nonce: number; block_hash: string }>,
    nearRpc("block", { finality: "final" }) as Promise<{
      header: { hash: string };
    }>,
  ]);

  const nonce = BigInt(accessKeyResult.nonce) + BigInt(1);
  const blockHash = bs58.decode(blockResult.header.hash);

  // Build transfer action (variant 3 = Transfer)
  const transferAction = concatBytes(borshU8(3), borshU128(amountYocto));

  // Borsh-serialize transaction
  const txBytes = concatBytes(
    borshString(nearAddress),
    borshU8(0), // PublicKey enum variant 0 = ed25519
    pubkey,
    borshU64(nonce),
    borshString(recipient),
    blockHash,
    borshU32(1), // 1 action
    transferAction,
  );

  // Hash and sign
  const txHash = sha256(txBytes);
  const hexHash = bytesToHex(txHash);
  const signResult = await signFn(hexHash);
  const sigBytes = decodeSig(signResult);

  // Build signed transaction
  const signedTxBytes = concatBytes(
    txBytes,
    borshU8(0), // Signature enum variant 0 = ed25519
    sigBytes,
  );

  // Base64 encode and submit
  const signedTxBase64 = btoa(String.fromCharCode(...signedTxBytes));
  const result = (await nearRpc("broadcast_tx_commit", [
    signedTxBase64,
  ])) as { transaction: { hash: string } };

  return result.transaction.hash;
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
