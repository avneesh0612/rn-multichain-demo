import React, { useState, useEffect } from "react";
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
  symbol: string;
  onSign: (message: string) => Promise<string>;
  onVerify?: (message: string, signature: string) => Promise<string>;
  onGetBalance?: () => Promise<string>;
  onTransfer?: (to: string, amount: number) => Promise<string>;
}

export default function ChainCard({
  chainName,
  curveType,
  address,
  isDerived,
  sourceChain,
  symbol,
  onSign,
  onVerify,
  onGetBalance,
  onTransfer,
}: ChainCardProps) {
  const [message, setMessage] = useState("Hello from Dynamic RN!");
  const [signature, setSignature] = useState<string | null>(null);
  const [verifyResult, setVerifyResult] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [transferLoading, setTransferLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (onGetBalance) {
      refreshBalance();
    }
  }, []);

  const refreshBalance = async () => {
    if (!onGetBalance) return;
    setBalanceLoading(true);
    try {
      const bal = await onGetBalance();
      setBalance(bal);
    } catch {
      setBalance("error");
    } finally {
      setBalanceLoading(false);
    }
  };

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

  const handleTransfer = async () => {
    if (!onTransfer || !recipient.trim() || !amount.trim()) return;
    setTransferLoading(true);
    setError(null);
    setTxHash(null);
    try {
      const hash = await onTransfer(recipient.trim(), parseFloat(amount));
      setTxHash(hash);
      refreshBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransferLoading(false);
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

      {/* Balance Section */}
      {onGetBalance && (
        <View style={styles.balanceRow}>
          <Text style={styles.label}>Balance</Text>
          <TouchableOpacity onPress={refreshBalance} disabled={balanceLoading}>
            <Text style={styles.refreshText}>
              {balanceLoading ? "..." : "Refresh"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
      {onGetBalance && (
        <Text style={styles.balanceValue}>
          {balance === null
            ? "Loading..."
            : balance === "error"
            ? "Failed to load"
            : `${balance} ${symbol}`}
        </Text>
      )}

      {/* Sign Section */}
      <Text style={styles.sectionTitle}>Sign Message</Text>
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
              style={[
                styles.button,
                styles.verifyButton,
                loading && styles.buttonDisabled,
              ]}
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

      {/* Transfer Section */}
      {onTransfer && (
        <>
          <Text style={styles.sectionTitle}>Transfer</Text>
          <TextInput
            style={styles.input}
            value={recipient}
            onChangeText={setRecipient}
            placeholder="Recipient address"
            placeholderTextColor="#888"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            value={amount}
            onChangeText={setAmount}
            placeholder={`Amount (${symbol})`}
            placeholderTextColor="#888"
            keyboardType="decimal-pad"
          />
          <TouchableOpacity
            style={[
              styles.button,
              styles.transferButton,
              transferLoading && styles.buttonDisabled,
            ]}
            onPress={handleTransfer}
            disabled={transferLoading}
          >
            {transferLoading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>
                Send {symbol}
              </Text>
            )}
          </TouchableOpacity>

          {txHash && (
            <>
              <Text style={styles.label}>Transaction Hash</Text>
              <Text style={styles.result} selectable numberOfLines={2}>
                {txHash}
              </Text>
            </>
          )}
        </>
      )}

      {error && (
        <>
          <Text style={styles.label}>Error</Text>
          <Text style={styles.error}>{error}</Text>
        </>
      )}

      <View style={{ height: 40 }} />
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
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    color: "#ccc",
    marginTop: 24,
    marginBottom: 8,
    borderTopWidth: 1,
    borderTopColor: "#2a2a4a",
    paddingTop: 16,
  },
  address: {
    fontSize: 13,
    color: "#7b7fda",
    fontFamily: "monospace",
    backgroundColor: "#2a2a4a",
    padding: 10,
    borderRadius: 6,
  },
  balanceRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 4,
  },
  refreshText: {
    color: "#7b7fda",
    fontSize: 13,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#fff",
    backgroundColor: "#2a2a4a",
    padding: 12,
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
    marginTop: 12,
  },
  verifyButton: {
    backgroundColor: "#2a8a4a",
  },
  transferButton: {
    backgroundColor: "#d97706",
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
    marginTop: 4,
  },
});
