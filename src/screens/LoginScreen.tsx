import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { dynamicClient } from "../dynamicClient";

export default function LoginScreen() {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOTP = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await dynamicClient.auth.email.sendOTP(email.trim());
      setOtpSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async () => {
    if (!otp.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await dynamicClient.auth.email.verifyOTP(otp.trim());
      // authSuccess event will trigger onLogin
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError(null);
    try {
      await dynamicClient.auth.email.resendOTP();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <Text style={styles.title}>Multichain Demo</Text>
      <Text style={styles.subtitle}>
        Sign messages across 10 chains using{"\n"}2 key types: ECDSA + Ed25519
      </Text>

      <View style={styles.chains}>
        <View style={styles.chainGroup}>
          <Text style={styles.groupLabel}>ECDSA (secp256k1)</Text>
          <Text style={styles.chainItem}>Ethereum (EVM)</Text>
          <Text style={styles.chainItem}>TRON (derived)</Text>
          <Text style={styles.chainItem}>Cosmos (derived)</Text>
          <Text style={styles.chainItem}>XRP (derived)</Text>
          <Text style={styles.chainItem}>Starknet (derived)</Text>
        </View>
        <View style={styles.chainGroup}>
          <Text style={styles.groupLabel}>Ed25519</Text>
          <Text style={styles.chainItem}>Solana</Text>
          <Text style={styles.chainItem}>NEAR (derived)</Text>
          <Text style={styles.chainItem}>Aptos (derived)</Text>
          <Text style={styles.chainItem}>Cardano (derived)</Text>
          <Text style={styles.chainItem}>Mavryk (derived)</Text>
        </View>
      </View>

      {!otpSent ? (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="Enter your email"
            placeholderTextColor="#666"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleSendOTP}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Send OTP</Text>
            )}
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <Text style={styles.sentLabel}>OTP sent to {email}</Text>
          <TextInput
            style={styles.input}
            value={otp}
            onChangeText={setOtp}
            placeholder="Enter OTP code"
            placeholderTextColor="#666"
            keyboardType="number-pad"
            autoComplete="one-time-code"
            editable={!loading}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleVerifyOTP}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Verify OTP</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.resendButton}
            onPress={handleResendOTP}
            disabled={loading}
          >
            <Text style={styles.resendText}>Resend OTP</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              setOtpSent(false);
              setOtp("");
              setError(null);
            }}
          >
            <Text style={styles.resendText}>Use a different email</Text>
          </TouchableOpacity>
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </KeyboardAvoidingView>
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
  form: {
    width: "100%",
    maxWidth: 320,
  },
  sentLabel: {
    color: "#7b7fda",
    fontSize: 13,
    marginBottom: 12,
    textAlign: "center",
  },
  input: {
    backgroundColor: "#1a1a2e",
    color: "#fff",
    padding: 14,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#3a3a5a",
    marginBottom: 12,
  },
  button: {
    backgroundColor: "#4a4af0",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  resendButton: {
    marginTop: 16,
    alignItems: "center",
  },
  resendText: {
    color: "#7b7fda",
    fontSize: 14,
    marginTop: 12,
    textAlign: "center",
  },
  error: {
    color: "#f87171",
    fontSize: 13,
    marginTop: 16,
    textAlign: "center",
    backgroundColor: "#3a1a1a",
    padding: 10,
    borderRadius: 6,
    maxWidth: 320,
  },
});
