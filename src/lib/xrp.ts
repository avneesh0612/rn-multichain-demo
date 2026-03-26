import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import bs58 from "bs58";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes";

const XRP_TESTNET = "https://s.altnet.rippletest.net:51234";

const BITCOIN_ALPHA = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
// Public Ripple base58 alphabet (differs from Bitcoin's) — not a secret
const RIPPLE_ALPHA = "rpshnaf39wBUDNEGHJKLM4PQRST7VWXYZ2bcdeCg65jkm8oFqi1tuvAxyz"; // trufflehog:ignore

// -- Address derivation --

function btcToRippleBase58(btcB58: string): string {
  let result = "";
  for (const ch of btcB58) result += RIPPLE_ALPHA[BITCOIN_ALPHA.indexOf(ch)];
  return result;
}

function rippleToBtcBase58(rippleB58: string): string {
  let result = "";
  for (const ch of rippleB58) result += BITCOIN_ALPHA[RIPPLE_ALPHA.indexOf(ch)];
  return result;
}

export function xrpAddressFromPubkey(compressedPubkey: Uint8Array): string {
  const accountId = ripemd160(sha256(compressedPubkey)) as Uint8Array;
  const versioned = new Uint8Array(21);
  versioned[0] = 0x00;
  versioned.set(accountId, 1);
  const checksum = (sha256(sha256(versioned)) as Uint8Array).slice(0, 4);
  return btcToRippleBase58(bs58.encode(concatBytes(versioned, checksum)));
}

export function xrpAddressToAccountId(addr: string): Uint8Array {
  const decoded = bs58.decode(rippleToBtcBase58(addr));
  return decoded.slice(1, 21); // remove version byte + checksum
}

/**
 * Recover compressed secp256k1 pubkey by signing a known message via the EVM wallet.
 */
export async function recoverEvmPubkey(
  signRawFn: (hexDigest: string) => Promise<string>
): Promise<Uint8Array> {
  const msgHash = sha256(new TextEncoder().encode("XRP_PUBKEY_RECOVERY")) as Uint8Array;
  const signature = await signRawFn(bytesToHex(msgHash));
  const sigBytes = hexToBytes(signature.replace(/^0x/, ""));
  const rsHex = bytesToHex(sigBytes.slice(0, 64));
  let v = sigBytes[64];
  if (v >= 27) v -= 27;
  const sig = secp256k1.Signature.fromHex(rsHex).addRecoveryBit(v);
  return sig.recoverPublicKey(msgHash).toBytes(true) as Uint8Array;
}

// -- Balance --

async function xrpRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(XRP_TESTNET, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params }),
  });
  const data = await res.json();
  return (data as { result: unknown }).result;
}

export async function getXrpBalance(xrpAddress: string): Promise<string> {
  try {
    const result = (await xrpRpc("account_info", [
      { account: xrpAddress, ledger_index: "current" },
    ])) as { account_data?: { Balance?: string }; error?: string };
    if (result.error) return "0";
    const drops = BigInt(result.account_data?.Balance ?? "0");
    return (Number(drops) / 1_000_000).toString();
  } catch {
    return "0";
  }
}

// -- DER signature encoding --

const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);
const HALF_N = SECP256K1_N / BigInt(2);

function normalizeLowS(s: bigint): bigint {
  return s > HALF_N ? SECP256K1_N - s : s;
}

function bigintToBytes32(n: bigint): Uint8Array {
  return hexToBytes(n.toString(16).padStart(64, "0"));
}

function sigToDER(rsHex: string): Uint8Array {
  const r = hexToBytes(rsHex.slice(0, 64));
  const sBigInt = normalizeLowS(BigInt("0x" + rsHex.slice(64)));
  const s = bigintToBytes32(sBigInt);

  function intBytes(v: Uint8Array): Uint8Array {
    let start = 0;
    while (start < v.length - 1 && v[start] === 0) start++;
    const trimmed = v.slice(start);
    if (trimmed[0] & 0x80) {
      const padded = new Uint8Array(trimmed.length + 1);
      padded.set(trimmed, 1);
      return padded;
    }
    return trimmed;
  }

  const rDer = intBytes(r);
  const sDer = intBytes(s);
  const contentLen = 2 + rDer.length + 2 + sDer.length;
  const result = new Uint8Array(2 + contentLen);
  result[0] = 0x30;
  result[1] = contentLen;
  result[2] = 0x02;
  result[3] = rDer.length;
  result.set(rDer, 4);
  result[4 + rDer.length] = 0x02;
  result[5 + rDer.length] = sDer.length;
  result.set(sDer, 6 + rDer.length);
  return result;
}

// -- XRP binary field encoding --

function encodeFieldId(typeCode: number, fieldCode: number): Uint8Array {
  if (typeCode < 16 && fieldCode < 16)
    return new Uint8Array([(typeCode << 4) | fieldCode]);
  if (typeCode < 16) return new Uint8Array([(typeCode << 4), fieldCode]);
  if (fieldCode < 16) return new Uint8Array([fieldCode, typeCode]);
  return new Uint8Array([0, typeCode, fieldCode]);
}

function encodeXrpAmount(drops: bigint): Uint8Array {
  let value = BigInt("0x4000000000000000") | drops;
  const bytes = new Uint8Array(8);
  for (let i = 7; i >= 0; i--) {
    bytes[i] = Number(value & BigInt(0xff));
    value >>= BigInt(8);
  }
  return bytes;
}

function encodeUint32(v: number): Uint8Array {
  return new Uint8Array([
    (v >>> 24) & 0xff,
    (v >>> 16) & 0xff,
    (v >>> 8) & 0xff,
    v & 0xff,
  ]);
}

function encodeVarLen(data: Uint8Array): Uint8Array {
  const len = data.length;
  if (len <= 192) return concatBytes(new Uint8Array([len]), data);
  if (len <= 12480) {
    return concatBytes(
      new Uint8Array([Math.floor((len - 193) / 256) + 193, (len - 193) % 256]),
      data
    );
  }
  return concatBytes(
    new Uint8Array([
      Math.floor((len - 12481) / 65536) + 241,
      Math.floor(((len - 12481) % 65536) / 256),
      (len - 12481) % 256,
    ]),
    data
  );
}

function serializePayment(opts: {
  account: Uint8Array;
  destination: Uint8Array;
  amount: bigint;
  fee: bigint;
  sequence: number;
  lastLedgerSequence: number;
  signingPubKey: Uint8Array;
  txnSignature?: Uint8Array;
}): Uint8Array {
  const parts: Uint8Array[] = [];
  parts.push(encodeFieldId(1, 2), new Uint8Array([0x00, 0x00])); // TransactionType = Payment
  parts.push(encodeFieldId(2, 2), encodeUint32(0)); // Flags
  parts.push(encodeFieldId(2, 4), encodeUint32(opts.sequence));
  parts.push(encodeFieldId(2, 27), encodeUint32(opts.lastLedgerSequence));
  parts.push(encodeFieldId(6, 1), encodeXrpAmount(opts.amount));
  parts.push(encodeFieldId(6, 8), encodeXrpAmount(opts.fee));
  parts.push(encodeFieldId(7, 3), encodeVarLen(opts.signingPubKey));
  if (opts.txnSignature)
    parts.push(encodeFieldId(7, 4), encodeVarLen(opts.txnSignature));
  parts.push(encodeFieldId(8, 1), encodeVarLen(opts.account));
  parts.push(encodeFieldId(8, 3), encodeVarLen(opts.destination));
  return concatBytes(...parts);
}

// -- Transfer --

export async function sendXrpTransfer(
  to: string,
  amountXrp: number,
  fromAddress: string,
  pubkeyHex: string,
  signRawFn: (hexDigest: string) => Promise<string>
): Promise<string> {
  const pubkeyBytes = hexToBytes(pubkeyHex);
  const drops = BigInt(Math.round(amountXrp * 1_000_000));

  const [accountInfo, feeInfo] = await Promise.all([
    xrpRpc("account_info", [{ account: fromAddress, ledger_index: "current" }]),
    xrpRpc("fee", []),
  ]) as [
    { account_data: { Sequence: number } },
    { drops?: { open_ledger_fee?: string }; ledger_current_index?: number },
  ];

  const sequence: number = accountInfo.account_data.Sequence;
  const fee = BigInt(Math.max(parseInt(feeInfo.drops?.open_ledger_fee ?? "12"), 12));
  const lastLedger: number = (feeInfo.ledger_current_index ?? 0) + 75;
  const accountId = xrpAddressToAccountId(fromAddress);
  const destId = xrpAddressToAccountId(to);

  const serialized = serializePayment({
    account: accountId,
    destination: destId,
    amount: drops,
    fee,
    sequence,
    lastLedgerSequence: lastLedger,
    signingPubKey: pubkeyBytes,
  });

  const HASH_PREFIX = new Uint8Array([0x53, 0x54, 0x58, 0x00]);
  const hash = (sha512(concatBytes(HASH_PREFIX, serialized)) as Uint8Array).slice(0, 32);

  const signature = await signRawFn(bytesToHex(hash));
  const sigBytes = hexToBytes(signature.replace(/^0x/, ""));
  const derSig = sigToDER(bytesToHex(sigBytes.slice(0, 64)));

  const signedSerialized = serializePayment({
    account: accountId,
    destination: destId,
    amount: drops,
    fee,
    sequence,
    lastLedgerSequence: lastLedger,
    signingPubKey: pubkeyBytes,
    txnSignature: derSig,
  });

  const txBlob = bytesToHex(signedSerialized).toUpperCase();
  const result = (await xrpRpc("submit", [{ tx_blob: txBlob }])) as {
    engine_result?: string;
    engine_result_message?: string;
    tx_json?: { hash?: string };
  };

  if (
    !result.engine_result?.startsWith("tes") &&
    !result.engine_result?.startsWith("ter")
  ) {
    throw new Error(`${result.engine_result}: ${result.engine_result_message}`);
  }

  return (
    result.tx_json?.hash ??
    bytesToHex(
      (
        sha512(
          concatBytes(new Uint8Array([0x54, 0x58, 0x4e, 0x00]), signedSerialized)
        ) as Uint8Array
      ).slice(0, 32)
    ).toUpperCase()
  );
}

// -- Signing --

export function xrpMessageDigest(message: string): string {
  const msgBytes = sha256(new TextEncoder().encode(message)) as Uint8Array;
  return bytesToHex(msgBytes);
}
