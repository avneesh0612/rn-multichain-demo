import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  cardanoMessageDigest,
  getCardanoBalance,
  sendCardanoTransfer,
} from "../lib/cardano";

interface Props {
  cardanoAddress: string;
  solAddress: string;
}

export default function CardanoScreen({ cardanoAddress, solAddress }: Props) {
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
    const hexDigest = cardanoMessageDigest(message);
    return signWithSol(hexDigest);
  };

  const handleGetBalance = async (): Promise<string> => {
    return getCardanoBalance(cardanoAddress);
  };

  const handleTransfer = async (to: string, amount: number): Promise<string> => {
    return sendCardanoTransfer(to, amount, cardanoAddress, solAddress, signWithSol);
  };

  return (
    <ChainCard
      chainName="Cardano"
      curveType="Ed25519"
      address={cardanoAddress}
      isDerived={true}
      sourceChain="Solana"
      symbol="ADA"
      onSign={handleSign}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
