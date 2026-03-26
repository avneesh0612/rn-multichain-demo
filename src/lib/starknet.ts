import { secp256k1 } from "@noble/curves/secp256k1.js";
import { sha256 } from "@noble/hashes/sha2.js";
import {
  grindKey,
  getStarkKey,
  pedersen,
  sign as starkSign,
  poseidonHashMany,
} from "@scure/starknet";
import { bytesToHex, hexToBytes } from "./bytes";

const STARKNET_RPC = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_10/5YmOu-MdRAt4L701phulZ";
// Public OpenZeppelin account class hash on Starknet Sepolia — not a secret
const OZ_CLASS_HASH =
  "0x061dac032f228abef9c6626f995015233097ae253a7f72d68552db02f2971b8f"; // trufflehog:ignore
// Public STRK ERC-20 token contract on Starknet Sepolia — not a secret
const STRK_TOKEN =
  "0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d"; // trufflehog:ignore
const STARK_PRIME = BigInt(
  "0x800000000000011000000000000000000000000000000000000000000000001"
);

// -- Address derivation --

/**
 * Recover the compressed secp256k1 public key from an EVM wallet signature.
 */
export async function recoverEvmPubkey(
  signRawFn: (hexDigest: string) => Promise<string>
): Promise<Uint8Array> {
  const msgHash = sha256(
    new TextEncoder().encode("STARKNET_PUBKEY_RECOVERY")
  ) as Uint8Array;
  const signature = await signRawFn(bytesToHex(msgHash));
  const sigBytes = hexToBytes(signature.replace(/^0x/, ""));
  const rsHex = bytesToHex(sigBytes.slice(0, 64));
  let v = sigBytes[64];
  if (v >= 27) v -= 27;
  const sig = secp256k1.Signature.fromHex(rsHex).addRecoveryBit(v);
  return sig.recoverPublicKey(msgHash).toBytes(true) as Uint8Array;
}

function feltToHex(n: bigint): string {
  return "0x" + n.toString(16);
}

function strip0x(s: string): string {
  return s.startsWith("0x") ? s.slice(2) : s;
}

function ped(a: bigint, b: bigint): bigint {
  return BigInt(pedersen(a, b));
}

function computeHashOnElements(elements: bigint[]): bigint {
  let h = BigInt(0);
  for (const e of elements) h = ped(h, e);
  return ped(h, BigInt(elements.length));
}

function computeContractAddress(
  classHash: bigint,
  salt: bigint,
  constructorCalldata: bigint[]
): string {
  const prefix = BigInt("0x535441524b4e45545f434f4e54524143545f41444452455353");
  const calldataHash = computeHashOnElements(constructorCalldata);
  const address = computeHashOnElements([
    prefix,
    BigInt(0),
    salt,
    classHash,
    calldataHash,
  ]);
  return feltToHex(address % STARK_PRIME);
}

export function deriveStarknetKeys(compressedPubkey: Uint8Array): {
  privateKey: string;
  publicKey: string;
  address: string;
} {
  const privateKeyHex = grindKey(compressedPubkey);
  const publicKey = getStarkKey(privateKeyHex);
  const publicKeyBigInt = BigInt(publicKey);
  const classHash = BigInt(OZ_CLASS_HASH);
  const address = computeContractAddress(classHash, publicKeyBigInt, [
    publicKeyBigInt,
  ]);
  return {
    privateKey: "0x" + privateKeyHex,
    publicKey,
    address,
  };
}

// -- RPC --

async function starkRpc(method: string, params: unknown): Promise<unknown> {
  const res = await fetch(STARKNET_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  if (!res.ok) throw new Error(`Starknet RPC HTTP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if ((data as { error?: unknown }).error)
    throw new Error(`RPC error: ${JSON.stringify((data as { error: unknown }).error)}`);
  return (data as { result: unknown }).result;
}

// -- Balance --

export async function getStarknetBalance(starkAddress: string): Promise<string> {
  try {
    const result = (await starkRpc("starknet_call", {
      request: {
        contract_address: STRK_TOKEN,
        // Public ERC-20 balanceOf() selector — not a secret
        entry_point_selector:
          "0x2e4263afad30923c891518314c3c95dbe830a16874e8abc5777a9a20b54c76e", // trufflehog:ignore
        calldata: [starkAddress],
      },
      block_id: "latest",
    })) as string[];
    const low = BigInt(result[0]);
    const high = BigInt(result[1]);
    const balance = (high << BigInt(128)) | low;
    return (Number(balance) / 1e18).toFixed(6).replace(/\.?0+$/, "");
  } catch {
    return "0";
  }
}

// -- Transfer --

function packResourceBound(nameFelt: bigint, maxAmount: bigint, maxPrice: bigint): bigint {
  // Pack as a single felt: name_felt << 128 | max_amount << 64 | max_price_per_unit
  return (nameFelt << BigInt(128)) | (maxAmount << BigInt(64)) | maxPrice;
}

function hashFeeFields(tip: bigint): bigint {
  // "L1_GAS" = 0x4c315f474153, "L2_GAS" = 0x4c325f474153, "L1_DATA_GAS" = 0x4c315f444154415f474153
  const l1Gas = packResourceBound(BigInt("0x4c315f474153"), BigInt(0x2000), BigInt("0x1000000000000"));
  const l2Gas = packResourceBound(BigInt("0x4c325f474153"), BigInt(0x200000), BigInt("0x10000000000"));
  const l1DataGas = packResourceBound(BigInt("0x4c315f444154415f474153"), BigInt(0x2000), BigInt("0x100000"));
  return poseidonHashMany([tip, l1Gas, l2Gas, l1DataGas]);
}

async function isAccountDeployed(address: string): Promise<boolean> {
  try {
    await starkRpc("starknet_getClassHashAt", ["latest", address]);
    return true;
  } catch (e) {
    // Starknet RPC error code 20 = "Contract not found"
    if (e instanceof Error && (
      e.message.toLowerCase().includes("contract not found") ||
      e.message.includes('"code":20') ||
      e.message.includes('"code": 20')
    )) return false;
    throw e;
  }
}

async function deployStarknetAccount(
  starkAddress: string,
  starkPrivateKey: string
): Promise<string> {
  const privKeyStripped = strip0x(starkPrivateKey);
  const publicKey = getStarkKey(privKeyStripped);
  const pubKeyBigInt = BigInt(publicKey);
  const classHash = BigInt(OZ_CLASS_HASH);
  const chainId = BigInt("0x534e5f5345504f4c4941");
  const constructorCalldata = [pubKeyBigInt];

  const txHashVal = poseidonHashMany([
    BigInt("0x6465706c6f795f6163636f756e74"), // "deploy_account"
    BigInt(3),
    BigInt(starkAddress),
    hashFeeFields(BigInt(0)),
    poseidonHashMany([]),
    chainId,
    BigInt(0), // nonce
    BigInt(0), // da_mode (both L1)
    poseidonHashMany(constructorCalldata),
    classHash,
    pubKeyBigInt, // salt
  ]);

  const sig = starkSign(feltToHex(txHashVal), privKeyStripped);
  const result = (await starkRpc("starknet_addDeployAccountTransaction", {
    deploy_account_transaction: {
      type: "DEPLOY_ACCOUNT",
      version: "0x3",
      signature: [feltToHex(sig.r), feltToHex(sig.s)],
      nonce: "0x0",
      contract_address_salt: publicKey,
      constructor_calldata: constructorCalldata.map(feltToHex),
      class_hash: OZ_CLASS_HASH,
      resource_bounds: {
        l1_gas: { max_amount: "0x2000", max_price_per_unit: "0x1000000000000" },
        l2_gas: { max_amount: "0x200000", max_price_per_unit: "0x10000000000" },
        l1_data_gas: { max_amount: "0x2000", max_price_per_unit: "0x100000" },
      },
      tip: "0x0",
      paymaster_data: [],
      nonce_data_availability_mode: "L1",
      fee_data_availability_mode: "L1",
    },
  })) as { transaction_hash: string };

  return result.transaction_hash;
}

export async function sendStarknetTransfer(
  to: string,
  amountStrk: number,
  starkAddress: string,
  starkPrivateKey: string
): Promise<string> {
  const deployed = await isAccountDeployed(starkAddress);
  if (!deployed) {
    await deployStarknetAccount(starkAddress, starkPrivateKey);
    // brief pause to let the node register the pending deploy before querying nonce
    await new Promise((r) => setTimeout(r, 1500));
  }

  const nonceHex = (await starkRpc("starknet_getNonce", [
    "pending",
    starkAddress,
  ])) as string;
  const nonce = BigInt(nonceHex);

  const amountWei = BigInt(Math.round(amountStrk * 1e18));
  const amountLow = feltToHex(amountWei & ((BigInt(1) << BigInt(128)) - BigInt(1)));
  const amountHigh = feltToHex(amountWei >> BigInt(128));
  // Public ERC-20 transfer() selector — not a secret
  const transferSelector = BigInt(
    "0x83afd3f4caedc6eebf44246fe54e38c95e3179a5ec9ea81740eca5b482d12e" // trufflehog:ignore
  );

  const calldata = [
    "0x1",
    STRK_TOKEN,
    feltToHex(transferSelector),
    "0x3",
    to,
    amountLow,
    amountHigh,
  ];

  const chainId = BigInt("0x534e5f5345504f4c4941");
  const calldataFelts = calldata.map((c) => BigInt(c));

  const txHashVal = poseidonHashMany([
    BigInt("0x696e766f6b65"),
    BigInt(3),
    BigInt(starkAddress),
    hashFeeFields(BigInt(0)),
    poseidonHashMany([]),
    chainId,
    nonce,
    BigInt(0),
    poseidonHashMany([]),
    poseidonHashMany(calldataFelts),
  ]);

  const sig = starkSign(feltToHex(txHashVal), strip0x(starkPrivateKey));
  const result = (await starkRpc("starknet_addInvokeTransaction", {
    invoke_transaction: {
      type: "INVOKE",
      version: "0x3",
      signature: [feltToHex(sig.r), feltToHex(sig.s)],
      nonce: feltToHex(nonce),
      sender_address: starkAddress,
      calldata,
      resource_bounds: {
        l1_gas: { max_amount: "0x2000", max_price_per_unit: "0x1000000000000" },
        l2_gas: { max_amount: "0x200000", max_price_per_unit: "0x10000000000" },
        l1_data_gas: { max_amount: "0x2000", max_price_per_unit: "0x100000" },
      },
      tip: "0x0",
      paymaster_data: [],
      account_deployment_data: [],
      nonce_data_availability_mode: "L1",
      fee_data_availability_mode: "L1",
    },
  })) as { transaction_hash: string };

  return result.transaction_hash;
}

// -- Signing (uses locally-derived Stark key, not WaaS) --

export function signStarknetMessage(
  message: string,
  starkPrivateKey: string
): { r: string; s: string } {
  const msgBytes = sha256(new TextEncoder().encode(message)) as Uint8Array;
  const msgFelt = BigInt("0x" + bytesToHex(msgBytes)) % STARK_PRIME;
  const sig = starkSign(feltToHex(msgFelt), strip0x(starkPrivateKey));
  return { r: feltToHex(sig.r), s: feltToHex(sig.s) };
}
