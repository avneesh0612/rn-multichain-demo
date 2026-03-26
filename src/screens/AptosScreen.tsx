import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  aptosMessageDigest,
  verifyAptosSignature,
  getAptosBalance,
  sendAptosTransfer,
} from "../lib/aptos";
import { decodeSig } from "../lib/ed25519-utils";
import { bytesToHex } from "../lib/bytes";

interface Props {
  aptosAddress: string;
  solAddress: string;
}

export default function AptosScreen({ aptosAddress, solAddress }: Props) {
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
    const hexDigest = aptosMessageDigest(message);
    return signWithSol(hexDigest);
  };

  const handleVerify = async (
    message: string,
    signature: string
  ): Promise<string> => {
    try {
      const valid = verifyAptosSignature(message, signature, solAddress);
      return valid
        ? `Valid! Signature verified for ${aptosAddress}`
        : "Invalid signature";
    } catch (e) {
      return `Verification failed: ${e instanceof Error ? e.message : String(e)}`;
    }
  };

  const handleGetBalance = async (): Promise<string> => {
    return getAptosBalance(aptosAddress);
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    return sendAptosTransfer(to, amount, aptosAddress, solAddress, signWithSol);
  };

  return (
    <ChainCard
      chainName="Aptos"
      curveType="Ed25519"
      address={aptosAddress}
      isDerived={true}
      sourceChain="Solana"
      symbol="APT"
      onSign={handleSign}
      onVerify={handleVerify}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
