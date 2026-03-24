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
    const connection = dynamicClient.solana.getConnection();
    const pubkey = new PublicKey(solAddress);
    const balance = await connection.getBalance(pubkey);
    return (balance / LAMPORTS_PER_SOL).toString();
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
    const connection = dynamicClient.solana.getConnection();

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
