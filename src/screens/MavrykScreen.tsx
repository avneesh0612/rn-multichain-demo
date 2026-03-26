import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  mavrykMessageDigest,
  verifyMavrykSignature,
  getMavrykBalance,
  sendMavrykTransfer,
} from "../lib/mavryk";

interface Props {
  mavrykAddress: string;
  solAddress: string;
}

export default function MavrykScreen({ mavrykAddress, solAddress }: Props) {
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
    const hexDigest = mavrykMessageDigest(message);
    return signWithSol(hexDigest);
  };

  const handleVerify = async (
    message: string,
    signature: string
  ): Promise<string> => {
    try {
      const valid = verifyMavrykSignature(message, signature, solAddress);
      return valid
        ? `Valid! Signature verified for ${mavrykAddress}`
        : "Invalid signature";
    } catch (e) {
      return `Verification failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const handleGetBalance = async (): Promise<string> => {
    return getMavrykBalance(mavrykAddress);
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    return sendMavrykTransfer(to, amount, mavrykAddress, signWithSol);
  };

  return (
    <ChainCard
      chainName="Mavryk"
      curveType="Ed25519"
      address={mavrykAddress}
      isDerived={true}
      sourceChain="Solana"
      symbol="MVRk"
      onSign={handleSign}
      onVerify={handleVerify}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
