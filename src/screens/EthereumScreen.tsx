import React from "react";
import { parseEther, formatEther } from "viem";
import { sepolia } from "viem/chains";
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

  const handleGetBalance = async (): Promise<string> => {
    const publicClient = dynamicClient.viem.createPublicClient({
      chain: sepolia,
    });
    const balance = await publicClient.getBalance({
      address: evmAddress as `0x${string}`,
    });
    return formatEther(balance);
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");

    const walletClient = await dynamicClient.viem.createWalletClient({
      wallet,
      chain: sepolia,
    });
    const hash = await walletClient.sendTransaction({
      to: to as `0x${string}`,
      value: parseEther(amount.toString()),
    });
    return hash;
  };

  return (
    <ChainCard
      chainName="Ethereum"
      curveType="ECDSA (secp256k1)"
      address={evmAddress}
      isDerived={false}
      symbol="ETH"
      onSign={handleSign}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
