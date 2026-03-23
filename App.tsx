import React, { useState, useEffect, useCallback } from "react";
import { StatusBar } from "expo-status-bar";
import { SafeAreaView, StyleSheet } from "react-native";
import { dynamicClient } from "./src/dynamicClient";
import LoginScreen from "./src/screens/LoginScreen";
import DashboardScreen from "./src/screens/DashboardScreen";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check if already authenticated
    if (dynamicClient.auth.authenticatedUser != null) {
      setIsAuthenticated(true);
    }

    // Listen for auth changes
    const handleAuthSuccess = () => setIsAuthenticated(true);
    const handleLogout = () => setIsAuthenticated(false);

    dynamicClient.auth.on("authSuccess", handleAuthSuccess);
    dynamicClient.auth.on("loggedOut", handleLogout);

    return () => {
      dynamicClient.auth.off("authSuccess", handleAuthSuccess);
      dynamicClient.auth.off("loggedOut", handleLogout);
    };
  }, []);

  const handleLogin = useCallback(() => setIsAuthenticated(true), []);
  const handleLoggedOut = useCallback(() => setIsAuthenticated(false), []);

  return (
    <>
      {/* Dynamic SDK WebView — must be rendered for auth to work */}
      <dynamicClient.reactNative.WebView />

      <SafeAreaView style={styles.container}>
        {isAuthenticated ? (
          <DashboardScreen onLogout={handleLoggedOut} />
        ) : (
          <LoginScreen onLogin={handleLogin} />
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
});
