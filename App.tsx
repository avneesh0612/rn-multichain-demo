import React, { useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { ActivityIndicator, SafeAreaView, StyleSheet, View } from "react-native";
import { useReactiveClient } from "@dynamic-labs/react-hooks";
import { dynamicClient } from "./src/dynamicClient";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";

export default function App() {
  // useReactiveClient re-renders when sdk.loaded or auth.token changes.
  // sdk.loaded becomes true only after the WebView has initialised AND
  // re-hydrated any saved session from expo-secure-store — checking auth
  // before that always returns null (the previous logout bug).
  const { sdk, auth } = useReactiveClient(dynamicClient);

  const handleLoggedOut = useCallback(() => dynamicClient.auth.logout(), []);

  return (
    <>
      {/* Dynamic SDK WebView — must be rendered for auth to work */}
      <dynamicClient.reactNative.WebView />

      <SafeAreaView style={styles.container}>
        {!sdk.loaded ? (
          <View style={styles.loading}>
            <ActivityIndicator size="large" color="#4a4af0" />
          </View>
        ) : auth.token ? (
          <DashboardScreen onLogout={handleLoggedOut} />
        ) : (
          <LoginScreen />
        )}
      </SafeAreaView>

      <StatusBar style="light" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0f0f23",
  },
  loading: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
});
