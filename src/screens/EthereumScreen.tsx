import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";

interface Props {
  evmAddress: string;
}

export default function EthereumScreen({ evmAddress }: Props) {
  const handleSign = async (message: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");

    const walletClient = await dynamicClient.viem.createWalletClient({
      wallet,
    });
    const signature = await walletClient.signMessage({ message });
    return signature;
  };

  return (
    <ChainCard
      chainName="Ethereum"
      curveType="ECDSA (secp256k1)"
      address={evmAddress}
      isDerived={false}
      onSign={handleSign}
    />
  );
}
