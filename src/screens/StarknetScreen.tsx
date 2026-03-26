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
import { dynamicClient } from "../dynamicClient";
import {
  recoverEvmPubkey,
  deriveStarknetKeys,
  getStarknetBalance,
  sendStarknetTransfer,
  signStarknetMessage,
} from "../lib/starknet";

export default function StarknetScreen() {
  const [starkAddress, setStarkAddress] = useState<string | null>(null);
  const [starkPrivKey, setStarkPrivKey] = useState<string | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Message signing state
  const [message, setMessage] = useState("Hello from Dynamic RN!");
  const [signature, setSignature] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  // Transfer state
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [balanceLoading, setBalanceLoading] = useState(false);

  const signRaw = async (hexDigest: string): Promise<string> => {
    const wallet = dynamicClient.wallets.userWallets.find(
      (w) => w.chain === "EVM"
    );
    if (!wallet) throw new Error("EVM wallet not found");
    return dynamicClient.wallets.waas.signRawMessage(wallet.id, {
      accountAddress: wallet.address,
      message: hexDigest,
    });
  };

  useEffect(() => {
    recoverEvmPubkey(signRaw)
      .then((pubkey) => {
        const keys = deriveStarknetKeys(pubkey);
        setStarkAddress(keys.address);
        setStarkPrivKey(keys.privateKey);
      })
      .catch((e) => setFatalError(e instanceof Error ? e.message : String(e)));
  }, []);

  const handleSign = async () => {
    if (!starkPrivKey) return;
    setSigning(true);
    setError(null);
    setSignature(null);
    try {
      const { r, s } = signStarknetMessage(message, starkPrivKey);
      setSignature(`r: ${r}\ns: ${s}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSigning(false);
    }
  };

  const handleGetBalance = async () => {
    if (!starkAddress) return;
    setBalanceLoading(true);
    try {
      const bal = await getStarknetBalance(starkAddress);
      setBalance(bal);
    } catch {
      setBalance("error");
    } finally {
      setBalanceLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!starkAddress || !starkPrivKey || !recipient.trim() || !amount.trim()) return;
    setTransferring(true);
    setError(null);
    setTxHash(null);
    try {
      const hash = await sendStarknetTransfer(
        recipient.trim(),
        parseFloat(amount),
        starkAddress,
        starkPrivKey
      );
      setTxHash(hash);
      handleGetBalance();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTransferring(false);
    }
  };

  if (fatalError) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{fatalError}</Text>
      </View>
    );
  }

  if (!starkAddress) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#4a4af0" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.scrollContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Starknet</Text>
        <Text style={styles.curve}>secp256k1 → Stark curve</Text>
      </View>
      <Text style={styles.derivedLabel}>Derived from Ethereum wallet</Text>

      <Text style={styles.label}>Address</Text>
      <Text style={styles.address} selectable>{starkAddress}</Text>

      {/* Balance */}
      <View style={styles.balanceRow}>
        <Text style={styles.label}>Balance</Text>
        <TouchableOpacity onPress={handleGetBalance} disabled={balanceLoading}>
          <Text style={styles.refreshText}>{balanceLoading ? "..." : "Refresh"}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.balanceValue}>
        {balance === null ? "Tap Refresh" : balance === "error" ? "Failed" : `${balance} STRK`}
      </Text>

      {/* Sign */}
      <Text style={styles.sectionTitle}>Sign Message</Text>
      <Text style={styles.note}>
        Signed locally with derived Stark key (no WaaS prompt).
      </Text>
      <TextInput
        style={styles.input}
        value={message}
        onChangeText={setMessage}
        placeholder="Enter message to sign"
        placeholderTextColor="#888"
      />
      <TouchableOpacity
        style={[styles.button, signing && styles.buttonDisabled]}
        onPress={handleSign}
        disabled={signing}
      >
        {signing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Sign Message</Text>
        )}
      </TouchableOpacity>
      {signature && (
        <>
          <Text style={styles.label}>Signature (r, s)</Text>
          <Text style={styles.result} selectable>{signature}</Text>
        </>
      )}

      {/* Transfer */}
      <Text style={styles.sectionTitle}>Transfer STRK</Text>
      <TextInput
        style={styles.input}
        value={recipient}
        onChangeText={setRecipient}
        placeholder="Recipient address (0x...)"
        placeholderTextColor="#888"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={[styles.input, { marginTop: 8 }]}
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount (STRK)"
        placeholderTextColor="#888"
        keyboardType="decimal-pad"
      />
      <TouchableOpacity
        style={[styles.button, styles.transferButton, transferring && styles.buttonDisabled]}
        onPress={handleTransfer}
        disabled={transferring}
      >
        {transferring ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Send STRK</Text>
        )}
      </TouchableOpacity>
      {txHash && (
        <>
          <Text style={styles.label}>Transaction Hash</Text>
          <Text style={styles.result} selectable numberOfLines={2}>{txHash}</Text>
        </>
      )}

      {error && (
        <>
          <Text style={styles.label}>Error</Text>
          <Text style={styles.errorText}>{error}</Text>
        </>
      )}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#1a1a2e",
  },
  scrollContainer: {
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
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#fff",
  },
  curve: {
    fontSize: 11,
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
  description: {
    fontSize: 14,
    color: "#aaa",
    lineHeight: 22,
    marginBottom: 24,
  },
  note: {
    fontSize: 12,
    color: "#666",
    fontStyle: "italic",
    marginBottom: 8,
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
  error: {
    color: "#f87171",
    fontSize: 13,
    marginBottom: 16,
    backgroundColor: "#3a1a1a",
    padding: 10,
    borderRadius: 6,
  },
  errorText: {
    fontSize: 13,
    color: "#f87171",
    backgroundColor: "#3a1a1a",
    padding: 10,
    borderRadius: 6,
    marginTop: 4,
  },
});
