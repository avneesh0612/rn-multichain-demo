import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
} from "react-native";
import { dynamicClient } from "../dynamicClient";
import { deriveTronAddress } from "../lib/tron";
import { deriveNearAddress } from "../lib/near";
import { deriveAptosAddress } from "../lib/aptos";
import { deriveCardanoAddress } from "../lib/cardano";
import { deriveMavrykAddress } from "../lib/mavryk";
import EthereumScreen from "./EthereumScreen";
import TronScreen from "./TronScreen";
import SolanaScreen from "./SolanaScreen";
import NearScreen from "./NearScreen";
import AptosScreen from "./AptosScreen";
import CardanoScreen from "./CardanoScreen";
import MavrykScreen from "./MavrykScreen";
import CosmosScreen from "./CosmosScreen";
import XrpScreen from "./XrpScreen";
import StarknetScreen from "./StarknetScreen";

type Tab =
  | "ethereum"
  | "tron"
  | "solana"
  | "near"
  | "aptos"
  | "cardano"
  | "mavryk"
  | "cosmos"
  | "xrp"
  | "starknet";

interface Props {
  onLogout: () => void;
}

export default function DashboardScreen({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("ethereum");
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [nearAddress, setNearAddress] = useState<string | null>(null);
  const [aptosAddress, setAptosAddress] = useState<string | null>(null);
  const [cardanoAddress, setCardanoAddress] = useState<string | null>(null);
  const [mavrykAddress, setMavrykAddress] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    initWallets();
  }, []);

  const initWallets = async () => {
    try {
      setLoading(true);
      setError(null);

      const wallets = dynamicClient.wallets.userWallets;

      let evmWallet = wallets.find((w) => w.chain === "EVM");
      let solWallet = wallets.find((w) => w.chain === "SOL");

      if (!evmWallet) {
        await dynamicClient.wallets.embedded.createWallet({ chain: "Evm" });
      }
      if (!solWallet) {
        await dynamicClient.wallets.embedded.createWallet({ chain: "Sol" });
      }

      const updatedWallets = dynamicClient.wallets.userWallets;
      evmWallet = updatedWallets.find((w) => w.chain === "EVM");
      solWallet = updatedWallets.find((w) => w.chain === "SOL");

      if (!evmWallet) throw new Error("Failed to create EVM wallet");
      if (!solWallet) throw new Error("Failed to create SOL wallet");

      setEvmAddress(evmWallet.address);
      setSolAddress(solWallet.address);

      // Deterministically derived chains (no extra signature required)
      setTronAddress(deriveTronAddress(evmWallet.address));
      setNearAddress(deriveNearAddress(solWallet.address));
      setAptosAddress(deriveAptosAddress(solWallet.address));
      setCardanoAddress(deriveCardanoAddress(solWallet.address));
      setMavrykAddress(deriveMavrykAddress(solWallet.address));

      // Cosmos, XRP, Starknet require secp256k1 pubkey recovery — derived lazily
      // inside their respective screens when the user first opens that tab.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await dynamicClient.auth.logout();
    onLogout();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4a4af0" />
        <Text style={styles.loadingText}>Setting up wallets...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.errorText}>Error: {error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={initWallets}>
          <Text style={styles.retryText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const tabs: { key: Tab; label: string; curve: string }[] = [
    { key: "ethereum", label: "ETH", curve: "ECDSA" },
    { key: "tron", label: "TRX", curve: "ECDSA" },
    { key: "cosmos", label: "ATOM", curve: "ECDSA" },
    { key: "xrp", label: "XRP", curve: "ECDSA" },
    { key: "starknet", label: "STRK", curve: "Stark" },
    { key: "solana", label: "SOL", curve: "Ed25519" },
    { key: "near", label: "NEAR", curve: "Ed25519" },
    { key: "aptos", label: "APT", curve: "Ed25519" },
    { key: "cardano", label: "ADA", curve: "Ed25519" },
    { key: "mavryk", label: "MVRk", curve: "Ed25519" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Multichain</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBar}
        contentContainerStyle={styles.tabBarContent}
      >
        {tabs.map((tab) => (
          <TouchableOpacity
            key={tab.key}
            style={[styles.tab, activeTab === tab.key && styles.activeTab]}
            onPress={() => setActiveTab(tab.key)}
          >
            <Text
              style={[
                styles.tabLabel,
                activeTab === tab.key && styles.activeTabLabel,
              ]}
            >
              {tab.label}
            </Text>
            <Text style={styles.tabCurve}>{tab.curve}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <View style={styles.content}>
        {activeTab === "ethereum" && evmAddress && (
          <EthereumScreen evmAddress={evmAddress} />
        )}
        {activeTab === "tron" && tronAddress && (
          <TronScreen tronAddress={tronAddress} />
        )}
        {activeTab === "solana" && solAddress && (
          <SolanaScreen solAddress={solAddress} />
        )}
        {activeTab === "near" && nearAddress && solAddress && (
          <NearScreen nearAddress={nearAddress} solAddress={solAddress} />
        )}
        {activeTab === "aptos" && aptosAddress && solAddress && (
          <AptosScreen aptosAddress={aptosAddress} solAddress={solAddress} />
        )}
        {activeTab === "cardano" && cardanoAddress && solAddress && (
          <CardanoScreen cardanoAddress={cardanoAddress} solAddress={solAddress} />
        )}
        {activeTab === "mavryk" && mavrykAddress && solAddress && (
          <MavrykScreen mavrykAddress={mavrykAddress} solAddress={solAddress} />
        )}
        {activeTab === "cosmos" && <CosmosScreen />}
        {activeTab === "xrp" && <XrpScreen />}
        {activeTab === "starknet" && <StarknetScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f23",
  },
  loadingText: {
    color: "#999",
    marginTop: 12,
    fontSize: 14,
  },
  errorText: {
    color: "#f87171",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 24,
  },
  retryButton: {
    marginTop: 16,
    backgroundColor: "#4a4af0",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
  },
  topBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
  },
  logoutText: {
    color: "#f87171",
    fontSize: 14,
  },
  tabBar: {
    flexGrow: 0,
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  tabBarContent: {
    gap: 4,
    paddingRight: 8,
  },
  tab: {
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "#1a1a2e",
    minWidth: 56,
  },
  activeTab: {
    backgroundColor: "#2a2a5e",
    borderBottomWidth: 2,
    borderBottomColor: "#4a4af0",
  },
  tabLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: "#666",
  },
  activeTabLabel: {
    color: "#fff",
  },
  tabCurve: {
    fontSize: 9,
    color: "#555",
    marginTop: 2,
  },
  content: {
    flex: 1,
  },
});
