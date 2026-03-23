import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import { nearMessageDigest, verifyNearSignature } from "../lib/near";

interface Props {
  nearAddress: string;
  solAddress: string;
}

export default function NearScreen({ nearAddress, solAddress }: Props) {
  const handleSign = async (message: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "SOL"
    );
    if (!wallet) throw new Error("Solana wallet not found");

    // Compute NEAR message digest (SHA-256 with NEAR prefix)
    const hexDigest = nearMessageDigest(message);

    // Sign the hex digest with the SOL wallet — the SDK detects hex
    // and signs the raw bytes with Ed25519
    const { signedMessage } = await dynamicClient.wallets.signMessage({
      wallet,
      message: hexDigest,
    });

    return signedMessage;
  };

  const handleVerify = async (
    message: string,
    signature: string
  ): Promise<string> => {
    try {
      const valid = verifyNearSignature(message, signature, solAddress);
      if (valid) {
        return `Valid! Signature verified for ${nearAddress}`;
      }
      return "Invalid signature";
    } catch (e) {
      return `Verification failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  return (
    <ChainCard
      chainName="NEAR"
      curveType="Ed25519"
      address={nearAddress}
      isDerived={true}
      sourceChain="Solana"
      onSign={handleSign}
      onVerify={handleVerify}
    />
  );
}
