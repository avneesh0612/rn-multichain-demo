import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { bech32 } from "bech32";
import { bytesToHex, hexToBytes, concatBytes } from "./bytes";

// Cosmos Hub provider testnet (theta-testnet-001 was deprecated Dec 2024)
const LCD = "https://rest.provider-sentry-01.hub-testnet.polypore.xyz";
const CHAIN_ID = "provider";
const DENOM = "uatom";
const GAS_LIMIT = "200000";
const FEE_AMOUNT = "5000";

// -- Address derivation --

/**
 * Derive a Cosmos address from a compressed secp256k1 public key.
 * cosmos1... = bech32( RIPEMD-160( SHA-256(compressedPubkey) ) )
 */
export function cosmosAddressFromPubkey(compressedPubkey: Uint8Array): string {
  const hash160 = ripemd160(sha256(compressedPubkey)) as Uint8Array;
  return bech32.encode("cosmos", bech32.toWords(hash160));
}

/**
 * Recover the compressed secp256k1 public key by signing a known message
 * and extracting the recovery bit from the signature.
 *
 * @param signRawFn - calls signRawMessage on the EVM wallet, returns hex sig (65 bytes)
 */
export async function recoverEvmPubkey(
  signRawFn: (hexDigest: string) => Promise<string>
): Promise<Uint8Array> {
  const msgHash = sha256(
    new TextEncoder().encode("COSMOS_PUBKEY_RECOVERY")
  ) as Uint8Array;
  const signature = await signRawFn(bytesToHex(msgHash));
  const sigBytes = hexToBytes(signature.replace(/^0x/, ""));
  const rsHex = bytesToHex(sigBytes.slice(0, 64));
  let v = sigBytes[64];
  if (v >= 27) v -= 27;
  const sig = secp256k1.Signature.fromHex(rsHex).addRecoveryBit(v);
  return sig.recoverPublicKey(msgHash).toBytes(true) as Uint8Array;
}

// -- Balance --

async function lcdGet(path: string): Promise<unknown> {
  const res = await fetch(`${LCD}${path}`);
  if (!res.ok) throw new Error(`LCD ${res.status}: ${await res.text()}`);
  return res.json();
}

async function lcdPost(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${LCD}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`LCD ${res.status}: ${await res.text()}`);
  return res.json();
}

export async function getCosmosBalance(cosmosAddress: string): Promise<string> {
  try {
    const data = (await lcdGet(
      `/cosmos/bank/v1beta1/balances/${cosmosAddress}`
    )) as { balances: { denom: string; amount: string }[] };
    const atom = data.balances?.find((b) => b.denom === DENOM);
    if (!atom) return "0";
    return (parseInt(atom.amount) / 1_000_000).toString();
  } catch {
    return "0";
  }
}

// -- Low-S normalization --

const SECP256K1_N = BigInt(
  "0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141"
);
const HALF_N = SECP256K1_N / BigInt(2);

function normalizeLowS(s: bigint): bigint {
  return s > HALF_N ? SECP256K1_N - s : s;
}

function sortedJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj))
    return "[" + (obj as unknown[]).map(sortedJsonStringify).join(",") + "]";
  const sorted = Object.keys(obj as Record<string, unknown>)
    .sort()
    .map(
      (k) =>
        `${JSON.stringify(k)}:${sortedJsonStringify((obj as Record<string, unknown>)[k])}`
    );
  return "{" + sorted.join(",") + "}";
}

// -- Protobuf helpers --

function pbVarint(n: number): Uint8Array {
  const bytes: number[] = [];
  let val = n >>> 0;
  while (val > 0x7f) {
    bytes.push((val & 0x7f) | 0x80);
    val >>>= 7;
  }
  bytes.push(val);
  return new Uint8Array(bytes);
}

function pbLen(fieldNum: number, data: Uint8Array): Uint8Array {
  return concatBytes(pbVarint((fieldNum << 3) | 2), pbVarint(data.length), data);
}

function pbStr(fieldNum: number, s: string): Uint8Array {
  return pbLen(fieldNum, new TextEncoder().encode(s));
}

function buildProtobufTxRaw(
  fromAddress: string,
  toAddress: string,
  microAmount: string,
  publicKey: Uint8Array,
  compactSig: Uint8Array,
  sequence: string
): Uint8Array {
  const coinPb = concatBytes(pbStr(1, DENOM), pbStr(2, microAmount));
  const msgSendPb = concatBytes(
    pbStr(1, fromAddress),
    pbStr(2, toAddress),
    pbLen(3, coinPb)
  );
  const msgAny = concatBytes(
    pbStr(1, "/cosmos.bank.v1beta1.MsgSend"),
    pbLen(2, msgSendPb)
  );
  const feeCoinPb = concatBytes(pbStr(1, DENOM), pbStr(2, FEE_AMOUNT));
  const feePb = concatBytes(
    pbLen(1, feeCoinPb),
    pbVarint((2 << 3) | 0), // field 2 = gas_limit (uint64, varint)
    pbVarint(parseInt(GAS_LIMIT))
  );
  const txBodyPb = pbLen(1, msgAny);
  const pubkeyAny = concatBytes(
    pbStr(1, "/cosmos.crypto.secp256k1.PubKey"),
    pbLen(2, pbLen(1, publicKey))
  );
  // Single{mode=SIGN_MODE_LEGACY_AMINO_JSON(127)}: field 1, varint type, value 127
  const singleBytes = concatBytes(pbVarint((1 << 3) | 0), pbVarint(127));
  // ModeInfo{single} as field 2 of SignerInfo (mode_info)
  const modeInfo = pbLen(2, pbLen(1, singleBytes));
  const signerInfo = concatBytes(
    pbLen(1, pubkeyAny),
    modeInfo,
    pbVarint((3 << 3) | 0),
    pbVarint(parseInt(sequence))
  );
  const authInfoPb = concatBytes(pbLen(1, signerInfo), pbLen(2, feePb));
  return concatBytes(pbLen(1, txBodyPb), pbLen(2, authInfoPb), pbLen(3, compactSig));
}

// -- Transfer --

export async function sendCosmosTransfer(
  to: string,
  amountAtom: number,
  fromAddress: string,
  pubkeyHex: string,
  signRawFn: (hexDigest: string) => Promise<string>
): Promise<string> {
  const pubkeyBytes = hexToBytes(pubkeyHex);
  const microAmount = Math.round(amountAtom * 1_000_000).toString();

  const [accountData, nodeData] = await Promise.all([
    lcdGet(`/cosmos/auth/v1beta1/accounts/${fromAddress}`),
    lcdGet("/cosmos/base/tendermint/v1beta1/node_info"),
  ]);

  const account = (accountData as { account?: Record<string, string> }).account ?? {};
  const accountNumber = account.account_number ?? "0";
  const sequence = account.sequence ?? "0";
  const chainId =
    (nodeData as { default_node_info?: { network?: string } })
      .default_node_info?.network ?? CHAIN_ID;

  const signDoc = {
    account_number: accountNumber,
    chain_id: chainId,
    fee: {
      amount: [{ amount: FEE_AMOUNT, denom: DENOM }],
      gas: GAS_LIMIT,
    },
    memo: "",
    msgs: [
      {
        type: "cosmos-sdk/MsgSend",
        value: {
          amount: [{ amount: microAmount, denom: DENOM }],
          from_address: fromAddress,
          to_address: to,
        },
      },
    ],
    sequence,
  };

  const signDocBytes = new TextEncoder().encode(sortedJsonStringify(signDoc));
  const digest = sha256(signDocBytes) as Uint8Array;
  const signature = await signRawFn(bytesToHex(digest));
  const sigBytes = hexToBytes(signature.replace(/^0x/, ""));

  const rHex = bytesToHex(sigBytes.slice(0, 32));
  const sNorm = normalizeLowS(BigInt("0x" + bytesToHex(sigBytes.slice(32, 64))));
  const sHex = sNorm.toString(16).padStart(64, "0");
  const compactSig = hexToBytes(rHex + sHex);

  const txRaw = buildProtobufTxRaw(
    fromAddress,
    to,
    microAmount,
    pubkeyBytes,
    compactSig,
    sequence
  );
  const txBase64 = btoa(String.fromCharCode(...txRaw));
  const result = (await lcdPost("/cosmos/tx/v1beta1/txs", {
    tx_bytes: txBase64,
    mode: "BROADCAST_MODE_SYNC",
  })) as { tx_response?: { txhash?: string; code?: number; raw_log?: string } };

  if (result.tx_response?.code && result.tx_response.code !== 0) {
    throw new Error(result.tx_response.raw_log ?? "Broadcast failed");
  }
  return result.tx_response?.txhash ?? "unknown";
}

// -- Signing --

export function cosmosMessageDigest(message: string): string {
  const signDocAmino = {
    chain_id: "",
    account_number: "0",
    sequence: "0",
    fee: { gas: "0", amount: [] },
    msgs: [{ type: "sign/MsgSignData", value: { signer: "", data: btoa(message) } }],
    memo: "",
  };
  const bytes = new TextEncoder().encode(sortedJsonStringify(signDocAmino));
  return bytesToHex(sha256(bytes) as Uint8Array);
}
