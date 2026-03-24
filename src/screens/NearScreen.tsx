import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  nearMessageDigest,
  verifyNearSignature,
  getNearBalance,
  sendNearTransfer,
} from "../lib/near";

interface Props {
  nearAddress: string;
  solAddress: string;
}

export default function NearScreen({ nearAddress, solAddress }: Props) {
  const signWithSol = async (hexDigest: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "SOL"
    );
    if (!wallet) throw new Error("Solana wallet not found");

    const { signedMessage } = await dynamicClient.wallets.signMessage({
      wallet,
      message: hexDigest,
    });
    return signedMessage;
  };

  const handleSign = async (message: string): Promise<string> => {
    const hexDigest = nearMessageDigest(message);
    return signWithSol(hexDigest);
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

  const handleGetBalance = async (): Promise<string> => {
    return getNearBalance(nearAddress);
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    return sendNearTransfer(to, amount, nearAddress, solAddress, signWithSol);
  };

  return (
    <ChainCard
      chainName="NEAR"
      curveType="Ed25519"
      address={nearAddress}
      isDerived={true}
      sourceChain="Solana"
      symbol="NEAR"
      onSign={handleSign}
      onVerify={handleVerify}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
