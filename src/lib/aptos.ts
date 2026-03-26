import { sha3_256 } from "@noble/hashes/sha3.js";
import bs58 from "bs58";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes";
import { solanaAddressToPubkey, decodeSig } from "./ed25519-utils";

const APTOS_TESTNET = "https://fullnode.testnet.aptoslabs.com/v1";

// -- Address derivation --

/**
 * Derive an Aptos address from a Solana address.
 * Both chains use Ed25519; Aptos address = SHA3-256(pubkey || 0x00)
 */
export function deriveAptosAddress(solanaAddress: string): string {
  const pubkey = solanaAddressToPubkey(solanaAddress);
  const payload = new Uint8Array(33);
  payload.set(pubkey, 0);
  payload[32] = 0x00; // single-key auth scheme indicator
  return "0x" + bytesToHex(sha3_256(payload));
}

// -- Balance --

/**
 * Query APT balance via the Aptos REST API.
 * Returns human-readable APT (octas / 1e8).
 */
export async function getAptosBalance(aptosAddress: string): Promise<string> {
  // Try old CoinStore model first
  try {
    const res = await fetch(
      `${APTOS_TESTNET}/accounts/${aptosAddress}/resource/0x1::coin::CoinStore%3C0x1::aptos_coin::AptosCoin%3E`
    );
    if (res.ok) {
      const data = await res.json();
      const octas = BigInt(data.data?.coin?.value ?? "0");
      if (octas > BigInt(0)) {
        return (Number(octas) / 1e8).toFixed(8).replace(/\.?0+$/, "");
      }
    }
  } catch {
    // fall through to FA model
  }

  // Fall back to new Fungible Asset model via view function
  try {
    const res = await fetch(`${APTOS_TESTNET}/view`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        function: "0x1::primary_fungible_store::balance",
        type_arguments: ["0x1::fungible_asset::Metadata"],
        arguments: [aptosAddress, "0x000000000000000000000000000000000000000000000000000000000000000a"],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      const octas = BigInt(data[0] ?? "0");
      return (Number(octas) / 1e8).toFixed(8).replace(/\.?0+$/, "");
    }
  } catch {
    // ignore
  }

  return "0";
}

// -- Transfer --

/**
 * Send APT via the Aptos REST API encode_submission endpoint.
 * Uses the /transactions/encode_submission endpoint to avoid manual BCS serialization.
 * Returns transaction hash.
 */
export async function sendAptosTransfer(
  to: string,
  amountApt: number,
  aptosAddress: string,
  solanaAddress: string,
  signFn: (hexDigest: string) => Promise<string>
): Promise<string> {
  const pubkey = solanaAddressToPubkey(solanaAddress);
  const octas = Math.round(amountApt * 1e8).toString();

  // Fetch account info for sequence number
  const accountRes = await fetch(`${APTOS_TESTNET}/accounts/${aptosAddress}`);
  if (!accountRes.ok) {
    const err = await accountRes.json().catch(() => ({}));
    throw new Error(err.message ?? `Account fetch failed: ${accountRes.status}`);
  }
  const account = await accountRes.json();
  const sequenceNumber = account.sequence_number;

  // Get current ledger for expiry
  const ledgerRes = await fetch(APTOS_TESTNET);
  const ledger = await ledgerRes.json();
  const expiry = (parseInt(ledger.ledger_timestamp) / 1e6 + 600).toFixed(0);

  const txPayload = {
    sender: aptosAddress,
    sequence_number: sequenceNumber,
    max_gas_amount: "20000",
    gas_unit_price: "100",
    expiration_timestamp_secs: expiry,
    payload: {
      type: "entry_function_payload",
      function: "0x1::aptos_account::transfer",
      type_arguments: [],
      arguments: [to, octas],
    },
  };

  // Encode submission to get signing bytes
  const encodeRes = await fetch(`${APTOS_TESTNET}/transactions/encode_submission`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(txPayload),
  });
  if (!encodeRes.ok) {
    const err = await encodeRes.json().catch(() => ({}));
    throw new Error(err.message ?? `Encode failed: ${encodeRes.status}`);
  }
  const signingBytesHex: string = await encodeRes.json();
  const signingBytes = hexToBytes(signingBytesHex);
  const hexDigest = bytesToHex(signingBytes);

  const sig = await signFn(hexDigest);
  const sigBytes = decodeSig(sig);

  const signedTx = {
    ...txPayload,
    signature: {
      type: "ed25519_signature",
      public_key: "0x" + bytesToHex(pubkey),
      signature: "0x" + bytesToHex(sigBytes),
    },
  };

  const submitRes = await fetch(`${APTOS_TESTNET}/transactions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(signedTx),
  });
  if (!submitRes.ok) {
    const err = await submitRes.json().catch(() => ({}));
    throw new Error(err.message ?? `Submit failed: ${submitRes.status}`);
  }
  const result = await submitRes.json();
  return result.hash;
}

// -- Signing --

/**
 * Compute the Aptos message digest for signing.
 * SHA3-256(message bytes) — returned as hex for signMessage.
 */
export function aptosMessageDigest(message: string): string {
  const msgBytes = new TextEncoder().encode(message);
  return bytesToHex(sha3_256(msgBytes));
}

// -- Verification --

/**
 * Verify an Aptos message signature using the Ed25519 public key.
 */
export function verifyAptosSignature(
  message: string,
  signature: string,
  solanaAddress: string
): boolean {
  const { ed25519 } = require("@noble/curves/ed25519.js");
  const pubkey = solanaAddressToPubkey(solanaAddress);
  const digest = hexToBytes(aptosMessageDigest(message));
  const sigBytes = decodeSig(signature);
  return ed25519.verify(sigBytes, digest, pubkey);
}
