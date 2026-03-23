import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  ScrollView,
} from "react-native";

interface ChainCardProps {
  chainName: string;
  curveType: "ECDSA (secp256k1)" | "Ed25519";
  address: string;
  isDerived: boolean;
  sourceChain?: string;
  onSign: (message: string) => Promise<string>;
  onVerify?: (message: string, signature: string) => Promise<string>;
}

export default function ChainCard({
  chainName,
  curveType,
  address,
  isDerived,
  sourceChain,
  onSign,
  onVerify,
}: ChainCardProps) {
  const [message, setMessage] = useState("Hello from Dynamic RN!");
  const [signature, setSignature] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    setLoading(true);
    setError(null);
    setSignature(null);
    setVerifyResult(null);
    try {
      const sig = await onSign(message);
      setSignature(sig);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!signature || !onVerify) return;
    setLoading(true);
    setError(null);
    setVerifyResult(null);
    try {
      const result = await onVerify(message, signature);
      setVerifyResult(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.chainName}>{chainName}</Text>
        <Text style={styles.curveType}>{curveType}</Text>
      </View>

      {isDerived && sourceChain && (
        <Text style={styles.derivedLabel}>
          Derived from {sourceChain} wallet
        </Text>
      )}

      <Text style={styles.label}>Address</Text>
      <Text style={styles.address} selectable>
        {address}
      </Text>

      <Text style={styles.label}>Message</Text>
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Enter message to sign"
        placeholderTextColor="#888"
      />

      <TouchableOpacity
        style={[styles.button, loading && styles.buttonDisabled]}
        onPress={handleSign}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Message</Text>
        )}
      </TouchableOpacity>

      {signature && (
        <>
          <Text style={styles.label}>Signature</Text>
          <Text style={styles.result} selectable numberOfLines={4}>
            {signature}
          </Text>

          {onVerify && (
            <TouchableOpacity
              style={[styles.button, styles.verifyButton, loading && styles.buttonDisabled]}
              onPress={handleVerify}
              disabled={loading}
            >
              <Text style={styles.buttonText}>Verify Signature</Text>
            </TouchableOpacity>
          )}
        </>
      )}

      {verifyResult && (
        <>
          <Text style={styles.label}>Verification</Text>
          <Text style={styles.verifyResult}>{verifyResult}</Text>
        </>
      )}

      {error && (
        <>
          <Text style={styles.label}>Error</Text>
          <Text style={styles.error}>{error}</Text>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#1a1a2e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  chainName: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  curveType: {
    fontSize: 12,
    color: "#7b7fda",
    backgroundColor: "#2a2a4a",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    overflow: "hidden",
  },
  derivedLabel: {
    fontSize: 12,
    color: "#aaa",
    marginBottom: 12,
    fontStyle: "italic",
  },
  label: {
    fontSize: 13,
    color: "#999",
    marginTop: 16,
    marginBottom: 4,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  address: {
    fontSize: 13,
    color: "#7b7fda",
    fontFamily: "monospace",
    backgroundColor: "#2a2a4a",
    padding: 10,
    borderRadius: 6,
  },
  input: {
    backgroundColor: "#2a2a4a",
    color: "#fff",
    padding: 12,
    borderRadius: 6,
    fontSize: 14,
    borderWidth: 1,
    borderColor: "#3a3a5a",
  },
  button: {
    backgroundColor: "#4a4af0",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 16,
  },
  verifyButton: {
    backgroundColor: "#2a8a4a",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  result: {
    fontSize: 12,
    color: "#ccc",
    fontFamily: "monospace",
    backgroundColor: "#2a2a4a",
    padding: 10,
    borderRadius: 6,
  },
  verifyResult: {
    fontSize: 14,
    color: "#4ade80",
    fontWeight: "600",
    backgroundColor: "#1a3a2a",
    padding: 10,
    borderRadius: 6,
  },
  error: {
    fontSize: 13,
    color: "#f87171",
    backgroundColor: "#3a1a1a",
    padding: 10,
    borderRadius: 6,
  },
});
