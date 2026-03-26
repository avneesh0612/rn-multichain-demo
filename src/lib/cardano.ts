import { blake2b } from "@noble/hashes/blake2.js";
import { bech32 } from "bech32";
import bs58 from "bs58";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes";
import { decodeSig } from "./ed25519-utils";

const KOIOS = "https://preprod.koios.rest/api/v1";

// -- Address derivation --

/**
 * Derive a Cardano enterprise address (addr_test1...) from a Solana address.
 * Cardano enterprise address = bech32( 0x60 || blake2b-224(Ed25519 pubkey) )
 *
 * 0x60 = payment key hash only (no staking key), testnet network tag.
 */
export function deriveCardanoAddress(solanaAddress: string): string {
  const pubkey = bs58.decode(solanaAddress);
  const keyHash = blake2b(pubkey, { dkLen: 28 }) as Uint8Array; // 28 bytes = 224 bits
  const payload = new Uint8Array(29);
  payload[0] = 0x60; // enterprise address, testnet
  payload.set(keyHash, 1);
  return bech32.encode("addr_test", bech32.toWords(payload), 108);
}

// -- Signing --

/**
 * Compute the Cardano message digest.
 * Cardano uses raw message bytes → Blake2b-256 → sign directly.
 * Returns hex-encoded Blake2b-256 hash.
 */
export function cardanoMessageDigest(message: string): string {
  const msgBytes = new TextEncoder().encode(message);
  return bytesToHex(blake2b(msgBytes, { dkLen: 32 }) as Uint8Array);
}

// -- CBOR encoding --

function cborHeader(major: number, n: number | bigint): Uint8Array {
  const v = typeof n === "number" ? BigInt(n) : n;
  const mt = major << 5;
  if (v < 24n) return new Uint8Array([mt | Number(v)]);
  if (v < 0x100n) return new Uint8Array([mt | 24, Number(v)]);
  if (v < 0x10000n)
    return new Uint8Array([mt | 25, Number(v >> 8n), Number(v & 0xffn)]);
  if (v < 0x100000000n) {
    const n32 = Number(v);
    return new Uint8Array([
      mt | 26,
      (n32 >>> 24) & 0xff,
      (n32 >>> 16) & 0xff,
      (n32 >>> 8) & 0xff,
      n32 & 0xff,
    ]);
  }
  const result = new Uint8Array(9);
  result[0] = mt | 27;
  let tmp = v;
  for (let i = 8; i >= 1; i--) {
    result[i] = Number(tmp & 0xffn);
    tmp >>= 8n;
  }
  return result;
}

function cborUint(n: number | bigint): Uint8Array {
  return cborHeader(0, n);
}

function cborBytes(data: Uint8Array): Uint8Array {
  return concatBytes(cborHeader(2, data.length), data);
}

function cborArray(items: Uint8Array[]): Uint8Array {
  return concatBytes(cborHeader(4, items.length), ...items);
}

function cborMap(pairs: [Uint8Array, Uint8Array][]): Uint8Array {
  return concatBytes(
    cborHeader(5, pairs.length),
    ...pairs.flatMap(([k, v]) => [k, v])
  );
}

// CBOR tag 258 = canonical Cardano finite set
function cborSet(items: Uint8Array[]): Uint8Array {
  return concatBytes(new Uint8Array([0xd9, 0x01, 0x02]), cborArray(items));
}

const CBOR_NULL = new Uint8Array([0xf6]);
const CBOR_TRUE = new Uint8Array([0xf5]);

// -- Balance --

export async function getCardanoBalance(address: string): Promise<string> {
  try {
    const res = await fetch(`${KOIOS}/address_info`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ _addresses: [address] }),
    });
    if (!res.ok) return "0";
    const data = (await res.json()) as { balance?: string }[];
    if (!data?.length) return "0";
    const lovelace = BigInt(data[0]?.balance ?? "0");
    return (Number(lovelace) / 1_000_000).toString();
  } catch {
    return "0";
  }
}

// -- Transfer --

export async function sendCardanoTransfer(
  to: string,
  amountAda: number,
  fromAddress: string,
  solanaAddress: string,
  signFn: (hexDigest: string) => Promise<string>
): Promise<string> {
  const lovelace = BigInt(Math.round(amountAda * 1_000_000));
  const FEE = 200_000n;
  const MIN_UTXO = 1_000_000n;

  // Fetch UTxOs and current slot in parallel
  const [utxoRes, tipRes] = await Promise.all([
    fetch(`${KOIOS}/address_utxos`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ _addresses: [fromAddress], _extended: false }),
    }),
    fetch(`${KOIOS}/tip`, { headers: { Accept: "application/json" } }),
  ]);

  type Utxo = { tx_hash: string; tx_index: number; value: string };
  const utxos = (await utxoRes.json()) as Utxo[];
  const tip = (await tipRes.json()) as [{ abs_slot: number }];

  if (!utxos?.length)
    throw new Error(
      "No UTxOs available. Fund your address at https://docs.cardano.org/cardano-testnets/tools/faucet/"
    );

  const currentSlot = tip[0].abs_slot;
  const ttl = currentSlot + 7200; // valid for ~2 hours

  // Greedy UTxO selection
  const needed = lovelace + FEE;
  let total = 0n;
  const selected: Utxo[] = [];
  for (const utxo of utxos) {
    selected.push(utxo);
    total += BigInt(utxo.value);
    if (total >= needed) break;
  }
  if (total < needed)
    throw new Error(
      `Insufficient balance: need ${Number(needed) / 1e6} ADA, have ${Number(total) / 1e6} ADA`
    );

  // Decode bech32 addresses to raw bytes
  const toAddrBytes = new Uint8Array(
    bech32.fromWords(bech32.decode(to, 108).words)
  );
  const fromAddrBytes = new Uint8Array(
    bech32.fromWords(bech32.decode(fromAddress, 108).words)
  );

  // Sort inputs canonically (by tx_hash hex then index)
  selected.sort((a, b) => {
    if (a.tx_hash < b.tx_hash) return -1;
    if (a.tx_hash > b.tx_hash) return 1;
    return a.tx_index - b.tx_index;
  });

  const encodedInputs = selected.map((u) =>
    cborArray([cborBytes(hexToBytes(u.tx_hash)), cborUint(u.tx_index)])
  );

  // Build outputs; absorb tiny change into fee to avoid min-UTxO rejection
  const changeLovelace = total - lovelace - FEE;
  const actualFee = changeLovelace >= MIN_UTXO ? FEE : total - lovelace;
  const outputs: Uint8Array[] = [
    cborArray([cborBytes(toAddrBytes), cborUint(lovelace)]),
  ];
  if (changeLovelace >= MIN_UTXO) {
    outputs.push(
      cborArray([cborBytes(fromAddrBytes), cborUint(changeLovelace)])
    );
  }

  // Build transaction body (CBOR map with keys 0–3)
  const txBody = cborMap([
    [cborUint(0), cborSet(encodedInputs)],
    [cborUint(1), cborArray(outputs)],
    [cborUint(2), cborUint(actualFee)],
    [cborUint(3), cborUint(ttl)],
  ]);

  // Sign blake2b-256 hash of the serialised transaction body
  const txBodyHash = blake2b(txBody, { dkLen: 32 }) as Uint8Array;
  const sig = await signFn(bytesToHex(txBodyHash));
  const sigBytes = decodeSig(sig);

  // vkey = raw 32-byte Ed25519 public key (same key as the Solana address)
  const vkey = bs58.decode(solanaAddress);
  const vkeyWitness = cborArray([cborBytes(vkey), cborBytes(sigBytes)]);
  const witnessSet = cborMap([[cborUint(0), cborArray([vkeyWitness])]]);

  // Full transaction: [body, witnesses, is_valid, auxiliary_data]
  const tx = cborArray([txBody, witnessSet, CBOR_TRUE, CBOR_NULL]);

  // Submit via Koios
  const submitRes = await fetch(`${KOIOS}/submittx`, {
    method: "POST",
    headers: { "Content-Type": "application/cbor" },
    body: tx,
  });
  if (!submitRes.ok) {
    const text = await submitRes.text();
    throw new Error(`Submit failed (${submitRes.status}): ${text}`);
  }
  const result = await submitRes.text();
  return result.replace(/^"|"$/g, "");
}
