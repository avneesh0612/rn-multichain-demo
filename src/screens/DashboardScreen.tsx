import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { dynamicClient } from "../dynamicClient";
import { deriveTronAddress } from "../lib/tron";
import { deriveNearAddress } from "../lib/near";
import EthereumScreen from "./EthereumScreen";
import TronScreen from "./TronScreen";
import SolanaScreen from "./SolanaScreen";
import NearScreen from "./NearScreen";

type Tab = "ethereum" | "tron" | "solana" | "near";

interface Props {
  onLogout: () => void;
}

export default function DashboardScreen({ onLogout }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>("ethereum");
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [solAddress, setSolAddress] = useState<string | null>(null);
  const [tronAddress, setTronAddress] = useState<string | null>(null);
  const [nearAddress, setNearAddress] = useState<string | null>(null);
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

      // Find EVM and SOL wallets
      let evmWallet = wallets.find((w) => w.chain === "EVM");
      let solWallet = wallets.find((w) => w.chain === "SOL");

      if (!evmWallet) {
        await dynamicClient.wallets.embedded.createWallet({ chain: "Evm" });
      }
      if (!solWallet) {
        await dynamicClient.wallets.embedded.createWallet({ chain: "Sol" });
      }

      // Re-fetch wallets after creation
      const updatedWallets = dynamicClient.wallets.userWallets;
      evmWallet = updatedWallets.find((w) => w.chain === "EVM");
      solWallet = updatedWallets.find((w) => w.chain === "SOL");

      if (!evmWallet) throw new Error("Failed to create EVM wallet");
      if (!solWallet) throw new Error("Failed to create SOL wallet");

      setEvmAddress(evmWallet.address);
      setSolAddress(solWallet.address);

      // Derive TRON address from EVM
      setTronAddress(deriveTronAddress(evmWallet.address));

      // Derive NEAR address from SOL
      setNearAddress(deriveNearAddress(solWallet.address));
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
    { key: "solana", label: "SOL", curve: "Ed25519" },
    { key: "near", label: "NEAR", curve: "Ed25519" },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Multichain</Text>
        <TouchableOpacity onPress={handleLogout}>
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabBar}>
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
      </View>

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
    flexDirection: "row",
    paddingHorizontal: 8,
    gap: 4,
    marginBottom: 4,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: "#1a1a2e",
  },
  activeTab: {
    backgroundColor: "#2a2a5e",
    borderBottomWidth: 2,
    borderBottomColor: "#4a4af0",
  },
  tabLabel: {
    fontSize: 14,
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
