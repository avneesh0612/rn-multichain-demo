import React, { useState, useEffect } from "react";
import { View, ActivityIndicator, Text, StyleSheet } from "react-native";
import ChainCard from "../components/ChainCard";
import { dynamicClient } from "../dynamicClient";
import {
  recoverEvmPubkey,
  xrpAddressFromPubkey,
  xrpMessageDigest,
  getXrpBalance,
  sendXrpTransfer,
} from "../lib/xrp";
import { bytesToHex } from "../lib/bytes";

export default function XrpScreen() {
  const [xrpAddress, setXrpAddress] = useState<string | null>(null);
  const [pubkeyHex, setPubkeyHex] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signRaw = async (hexDigest: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");
    const doSign = () =>
      dynamicClient.wallets.waas.signRawMessage(wallet.id, {
        accountAddress: wallet.address,
        message: hexDigest,
      });
    try {
      return await doSign();
    } catch (e) {
      if (e instanceof Error && e.message.toLowerCase().includes("handshake")) {
        await new Promise((r) => setTimeout(r, 800));
        return doSign();
      }
      throw e;
    }
  };

  useEffect(() => {
    recoverEvmPubkey(signRaw)
      .then((pubkey) => {
        setXrpAddress(xrpAddressFromPubkey(pubkey));
        setPubkeyHex(bytesToHex(pubkey));
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!xrpAddress) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a4af0" />
      </View>
    );
  }

  return (
    <ChainCard
      chainName="XRP"
      curveType="ECDSA (secp256k1)"
      address={xrpAddress}
      isDerived={true}
      sourceChain="Ethereum"
      symbol="XRP"
      onSign={(message) => signRaw(xrpMessageDigest(message))}
      onGetBalance={() => getXrpBalance(xrpAddress)}
      onTransfer={(to, amount) =>
        sendXrpTransfer(to, amount, xrpAddress, pubkeyHex!, signRaw)
      }
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 24,
    backgroundColor: "#3a1a1a",
    padding: 10,
    borderRadius: 6,
  },
});
