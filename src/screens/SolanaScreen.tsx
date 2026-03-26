import React from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";

const DEVNET_RPC = "https://api.devnet.solana.com";
const SOLANA_CONNECTION = new Connection(DEVNET_RPC, "confirmed");

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

  const handleGetBalance = async (): Promise<string> => {
    const res = await fetch(DEVNET_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [solAddress],
      }),
    });
    const data = await res.json();
    const lamports: number = data.result?.value ?? 0;
    return (lamports / LAMPORTS_PER_SOL).toString();
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "SOL"
    );
    if (!wallet) throw new Error("Solana wallet not found");

    const signer = dynamicClient.solana.getSigner({ wallet });
    const connection = SOLANA_CONNECTION;

    const fromPubkey = new PublicKey(solAddress);
    const toPubkey = new PublicKey(to);

    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey,
        lamports: Math.round(amount * LAMPORTS_PER_SOL),
      })
    );

    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = fromPubkey;

    const signed = await signer.signTransaction(transaction);
    const txId = await connection.sendRawTransaction(signed.serialize());
    return txId;
  };

  return (
    <ChainCard
      chainName="Solana"
      curveType="Ed25519"
      address={solAddress}
      isDerived={false}
      symbol="SOL"
      onSign={handleSign}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
