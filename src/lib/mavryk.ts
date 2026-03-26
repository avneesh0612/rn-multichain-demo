import { blake2b } from "@noble/hashes/blake2.js";
import { sha256 } from "@noble/hashes/sha2.js";
import bs58 from "bs58";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes";
import { solanaAddressToPubkey, decodeSig } from "./ed25519-utils";

const MAVRYK_RPC = "https://basenet.rpc.mavryk.network";

// -- Mavryk base58check encoding --
// Prefix bytes: mv1 = [5, 186, 196] (Ed25519 implicit address)

const PREFIX_MV1 = new Uint8Array([5, 186, 196]);

function mavrykB58cencode(payload: Uint8Array, prefixBytes: Uint8Array): string {
  const combined = concatBytes(prefixBytes, payload);
  const checksum = sha256(sha256(combined)).slice(0, 4);
  return bs58.encode(concatBytes(combined, checksum));
}

// -- Address derivation --

/**
 * Derive a Mavryk mv1 address from a Solana address.
 * mv1 = base58check( [5,186,196] || blake2b-20(pubkey) )
 */
export function deriveMavrykAddress(solanaAddress: string): string {
  const pubkey = solanaAddressToPubkey(solanaAddress);
  const hash = blake2b(pubkey, { dkLen: 20 }) as Uint8Array;
  return mavrykB58cencode(hash, PREFIX_MV1);
}

// -- RPC helpers --

async function rpcGet(path: string): Promise<unknown> {
  const res = await fetch(`${MAVRYK_RPC}${path}`);
  if (!res.ok) throw new Error(`Mavryk RPC ${res.status}: ${await res.text()}`);
  return res.json();
}

async function rpcPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${MAVRYK_RPC}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Mavryk RPC ${res.status}: ${await res.text()}`);
  return res.json();
}

// -- Balance --

export async function getMavrykBalance(mavrykAddress: string): Promise<string> {
  try {
    const balance = (await rpcGet(
      `/chains/main/blocks/head/context/contracts/${mavrykAddress}/balance`
    )) as string;
    return (parseInt(balance) / 1_000_000).toString();
  } catch {
    return "0";
  }
}

// -- Transfer --

/**
 * Send MVRk via Mavryk RPC forge + injection.
 * Uses the forge endpoint to avoid manual binary encoding.
 * Returns operation hash.
 */
export async function sendMavrykTransfer(
  to: string,
  amountMvk: number,
  fromAddress: string,
  signFn: (hexDigest: string) => Promise<string>
): Promise<string> {
  const microMvk = Math.round(amountMvk * 1_000_000).toString();

  // Fetch current block hash and counter
  const [blockHead, counterStr] = await Promise.all([
    rpcGet("/chains/main/blocks/head/header") as Promise<{ hash: string }>,
    rpcGet(
      `/chains/main/blocks/head/context/contracts/${fromAddress}/counter`
    ) as Promise<string>,
  ]);

  const branch = blockHead.hash;
  const counter = (parseInt(counterStr) + 1).toString();

  // Forge the operation
  const forgeBody = {
    branch,
    contents: [
      {
        kind: "transaction",
        source: fromAddress,
        fee: "1000",
        counter,
        gas_limit: "10300",
        storage_limit: "0",
        amount: microMvk,
        destination: to,
      },
    ],
  };

  const forgedHex = (await rpcPost(
    "/chains/main/blocks/head/helpers/forge/operations",
    forgeBody
  )) as string;

  const forgedBytes = hexToBytes(forgedHex);

  // Mavryk operation signing: blake2b-256( 0x03 || forged_bytes )
  const watermarked = concatBytes(new Uint8Array([0x03]), forgedBytes);
  const digest = blake2b(watermarked, { dkLen: 32 }) as Uint8Array;

  const sig = await signFn(bytesToHex(digest));
  const sigBytes = decodeSig(sig);

  // Inject: forged_hex + signature_hex
  const injectPayload = `"${forgedHex}${bytesToHex(sigBytes)}"`;
  const res = await fetch(`${MAVRYK_RPC}/injection/operation`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: injectPayload,
  });
  if (!res.ok) {
    throw new Error(`Injection failed: ${res.status} ${await res.text()}`);
  }
  const opHash: string = await res.json();
  return opHash;
}

// -- Signing --

/**
 * Compute the Mavryk message digest for signing.
 * Mavryk requires blake2b-256 of the message before signing.
 */
export function mavrykMessageDigest(message: string): string {
  const msgBytes = new TextEncoder().encode(message);
  // Apply the 0x05 "generic" watermark for Mavryk arbitrary data signing
  const watermarked = concatBytes(new Uint8Array([0x05]), msgBytes);
  return bytesToHex(blake2b(watermarked, { dkLen: 32 }) as Uint8Array);
}

// -- Verification --

export function verifyMavrykSignature(
  message: string,
  signature: string,
  solanaAddress: string
): boolean {
  const { ed25519 } = require("@noble/curves/ed25519.js");
  const pubkey = solanaAddressToPubkey(solanaAddress);
  const digest = hexToBytes(mavrykMessageDigest(message));
  const sigBytes = decodeSig(signature);
  return ed25519.verify(sigBytes, digest, pubkey);
}
