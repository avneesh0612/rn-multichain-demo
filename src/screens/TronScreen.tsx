import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import { tronMessageDigest, verifyTronSignature } from "../lib/tron";

interface Props {
  tronAddress: string;
}

export default function TronScreen({ tronAddress }: Props) {
  const handleSign = async (message: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");

    // Compute TRON message digest (keccak256 with TRON prefix)
    const digest = tronMessageDigest(message);

    // Sign the raw 32-byte digest via WaaS
    const signature = await dynamicClient.wallets.waas.signRawMessage(
      wallet.id,
      {
        accountAddress: wallet.address,
        message: digest,
      }
    );

    return signature;
  };

  const handleVerify = async (
    message: string,
    signature: string
  ): Promise<string> => {
    try {
      const recoveredAddress = verifyTronSignature(message, signature);
      if (recoveredAddress === tronAddress) {
        return `Valid! Recovered: ${recoveredAddress}`;
      }
      return `Mismatch! Expected: ${tronAddress}, Got: ${recoveredAddress}`;
    } catch (e) {
      return `Verification failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  return (
    <ChainCard
      chainName="TRON"
      curveType="ECDSA (secp256k1)"
      address={tronAddress}
      isDerived={true}
      sourceChain="Ethereum"
      onSign={handleSign}
      onVerify={handleVerify}
    />
  );
}
