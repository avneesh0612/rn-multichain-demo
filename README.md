# RN Multichain Demo

A React Native (Expo) demo app showcasing Dynamic embedded wallets across all Tier 2 chains. Two base wallets (EVM + Solana) are used to derive addresses for 8 additional chains without any extra key material.

## Supported Chains

| Chain | Curve | Derived From | Method |
|---|---|---|---|
| Ethereum | secp256k1 | Native EVM | — |
| Solana | Ed25519 | Native SOL | — |
| TRON | secp256k1 | EVM | re-encode address as base58check |
| Cosmos | secp256k1 | EVM | recover pubkey → RIPEMD-160(SHA-256) |
| XRP | secp256k1 | EVM | recover pubkey → RIPEMD-160(SHA-256) |
| Starknet | Stark curve | EVM | recover pubkey → grindKey → Pedersen |
| NEAR | Ed25519 | Solana | hex-encode pubkey as implicit account |
| Aptos | Ed25519 | Solana | SHA3-256(pubkey ‖ 0x00) |
| Cardano | Ed25519 | Solana | Blake2b-224(pubkey), bech32 |
| Mavryk | Ed25519 | Solana | Blake2b-20(pubkey), base58check |

> **Cosmos, XRP, and Starknet** require one signature on first use to recover the secp256k1 public key. All other chains derive addresses instantly.

## Install dependencies

### npm
```bash
npm install @dynamic-labs/client @dynamic-labs/react-hooks @dynamic-labs/react-native-extension \
  @dynamic-labs/solana @dynamic-labs/solana-extension @dynamic-labs/viem-extension \
  @noble/curves @noble/hashes @scure/starknet \
  bs58 bs58check bech32 \
  @react-native-anywhere/polyfill-base64 \
  @solana/web3.js \
  expo expo-linking expo-secure-store expo-status-bar expo-web-browser \
  react-native react-native-webview viem
```

### yarn
```bash
yarn add @dynamic-labs/client @dynamic-labs/react-hooks @dynamic-labs/react-native-extension \
  @dynamic-labs/solana @dynamic-labs/solana-extension @dynamic-labs/viem-extension \
  @noble/curves @noble/hashes @scure/starknet \
  bs58 bs58check bech32 \
  @react-native-anywhere/polyfill-base64 \
  @solana/web3.js \
  expo expo-linking expo-secure-store expo-status-bar expo-web-browser \
  react-native react-native-webview viem
```

### pnpm
```bash
pnpm add @dynamic-labs/client @dynamic-labs/react-hooks @dynamic-labs/react-native-extension \
  @dynamic-labs/solana @dynamic-labs/solana-extension @dynamic-labs/viem-extension \
  @noble/curves @noble/hashes @scure/starknet \
  bs58 bs58check bech32 \
  @react-native-anywhere/polyfill-base64 \
  @solana/web3.js \
  expo expo-linking expo-secure-store expo-status-bar expo-web-browser \
  react-native react-native-webview viem
```

### bun
```bash
bun add @dynamic-labs/client @dynamic-labs/react-hooks @dynamic-labs/react-native-extension \
  @dynamic-labs/solana @dynamic-labs/solana-extension @dynamic-labs/viem-extension \
  @noble/curves @noble/hashes @scure/starknet \
  bs58 bs58check bech32 \
  @react-native-anywhere/polyfill-base64 \
  @solana/web3.js \
  expo expo-linking expo-secure-store expo-status-bar expo-web-browser \
  react-native react-native-webview viem
```

## Run

```bash
# Start Expo dev server
npm start   # or: yarn start / pnpm start / bun start

# iOS (requires macOS + Xcode)
npm run ios

# Android
npm run android
```

## Architecture

All cryptographic operations use `@noble/curves` and `@noble/hashes` — pure-JS, audited, zero Node.js dependencies. No native modules required for any chain beyond what Expo already provides.

```
src/
  dynamicClient.ts          # createClient() with RN + Viem + Solana extensions
  lib/
    bytes.ts                # hex/bytes utilities
    ed25519-utils.ts        # Ed25519 sig decoding, SOL pubkey extraction
    tron.ts                 # TRON address derivation + signing
    near.ts                 # NEAR address derivation + Borsh tx serialization
    aptos.ts                # Aptos address derivation + REST API tx
    cardano.ts              # Cardano address derivation (Blake2b + bech32)
    cosmos.ts               # Cosmos pubkey recovery + protobuf tx
    xrp.ts                  # XRP pubkey recovery + binary tx serialization
    mavryk.ts               # Mavryk address derivation + RPC forge/inject
    starknet.ts             # Starknet grindKey derivation + Poseidon tx hash
  screens/
    LoginScreen.tsx
    DashboardScreen.tsx     # Scrollable tab bar, initializes all wallets
    EthereumScreen.tsx
    SolanaScreen.tsx
    TronScreen.tsx
    NearScreen.tsx
    AptosScreen.tsx
    CardanoScreen.tsx
    MavrykScreen.tsx
    CosmosScreen.tsx        # Lazy pubkey recovery on first open
    XrpScreen.tsx           # Lazy pubkey recovery on first open
    StarknetScreen.tsx      # Lazy pubkey recovery + local Stark signing
  components/
    ChainCard.tsx           # Reusable sign / verify / balance / transfer UI
```
