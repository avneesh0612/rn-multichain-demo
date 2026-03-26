import React from "react";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  tronMessageDigest,
  verifyTronSignature,
  getTronBalance,
  sendTronTransfer,
} from "../lib/tron";
import { strip0x } from "../lib/bytes";

interface Props {
  tronAddress: string;
}

export default function TronScreen({ tronAddress }: Props) {
  const signRaw = async (digest: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");
    const doSign = () =>
      dynamicClient.wallets.waas.signRawMessage(wallet.id, {
        accountAddress: wallet.address,
        message: digest,
      });
    try {
      return await doSign();
    } catch (e) {
      // ML-KEM session state can go stale after an async gap (e.g. the
      // TronGrid createtransaction fetch). Retry once after a short delay.
      if (e instanceof Error && e.message.toLowerCase().includes("handshake")) {
        await new Promise((r) => setTimeout(r, 800));
        return doSign();
      }
      throw e;
    }
  };

  const handleSign = async (message: string): Promise<string> => {
    const digest = tronMessageDigest(message);
    return signRaw(digest);
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

  const handleGetBalance = async (): Promise<string> => {
    return getTronBalance(tronAddress);
  };

  const handleTransfer = async (
    to: string,
    amount: number
  ): Promise<string> => {
    return sendTronTransfer(to, amount, tronAddress, signRaw);
  };

  return (
    <ChainCard
      chainName="TRON"
      curveType="ECDSA (secp256k1)"
      address={tronAddress}
      isDerived={true}
      sourceChain="Ethereum"
      symbol="TRX"
      onSign={handleSign}
      onVerify={handleVerify}
      onGetBalance={handleGetBalance}
      onTransfer={handleTransfer}
    />
  );
}
