import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";

interface Props {
  solAddress: string;
}

export default function SolanaScreen({ solAddress }: Props) {
  const handleSign = async (message: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "SOL"
    );
    if (!wallet) throw new Error("Solana wallet not found");

    const { signedMessage } = await dynamicClient.wallets.signMessage({
      wallet,
      message,
    });

    return signedMessage;
  };

  return (
    <ChainCard
      chainName="Solana"
      curveType="Ed25519"
      address={solAddress}
      isDerived={false}
      onSign={handleSign}
    />
  );
}
