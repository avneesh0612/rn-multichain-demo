import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { dynamicClient } from "../dynamicClient";

interface LoginScreenProps {
  onLogin: () => void;
}

export default function LoginScreen({ onLogin }: LoginScreenProps) {
  const handleLogin = () => {
    dynamicClient.ui.auth.show();
  };

  React.useEffect(() => {
    const handler = () => onLogin();
    dynamicClient.auth.on("authSuccess", handler);
    return () => {
      dynamicClient.auth.off("authSuccess", handler);
    };
  }, [onLogin]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Multichain Demo</Text>
      <Text style={styles.subtitle}>
        Sign messages across 4 chains using{"\n"}2 key types: ECDSA + Ed25519
      </Text>

      <View style={styles.chains}>
        <View style={styles.chainGroup}>
          <Text style={styles.groupLabel}>ECDSA (secp256k1)</Text>
          <Text style={styles.chainItem}>Ethereum (EVM)</Text>
          <Text style={styles.chainItem}>TRON (derived)</Text>
        </View>
        <View style={styles.chainGroup}>
          <Text style={styles.groupLabel}>Ed25519</Text>
          <Text style={styles.chainItem}>Solana</Text>
          <Text style={styles.chainItem}>NEAR (derived)</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Sign In with Dynamic</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#0f0f23",
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#fff",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    marginBottom: 32,
    lineHeight: 20,
  },
  chains: {
    flexDirection: "row",
    gap: 24,
    marginBottom: 40,
  },
  chainGroup: {
    backgroundColor: "#1a1a2e",
    borderRadius: 12,
    padding: 16,
    minWidth: 140,
  },
  groupLabel: {
    fontSize: 11,
    color: "#7b7fda",
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 8,
  },
  chainItem: {
    fontSize: 14,
    color: "#ccc",
    marginBottom: 4,
  },
  button: {
    backgroundColor: "#4a4af0",
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
});
