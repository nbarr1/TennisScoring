import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  refreshEmailVerification,
  sendVerificationEmail,
  signOutReleasingPushToken,
  useAuthUser,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";

/**
 * Shown by the auth gate while the signed-in account's email address is not
 * verified. Once it is, the gate moves on to division selection by itself.
 */
export default function VerifyEmailScreen() {
  const { firebaseUser } = useAuthUser();
  const setUser = useAppStore((state) => state.setUser);
  const [busy, setBusy] = useState(false);

  async function handleContinue() {
    setBusy(true);
    try {
      const verified = await refreshEmailVerification();
      if (!verified) {
        Alert.alert(
          "Not Verified Yet",
          "Open the link in the verification email, then try again.",
        );
      }
    } catch (err) {
      console.error("Failed to refresh verification status:", err);
      Alert.alert(
        "Error",
        "Could not check your verification status. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleResend() {
    setBusy(true);
    try {
      await sendVerificationEmail();
      Alert.alert(
        "Email Sent",
        "We sent a new verification link. Check your inbox and spam folder.",
      );
    } catch (err) {
      const code = (err as { code?: string }).code;
      Alert.alert(
        "Error",
        code === "auth/too-many-requests"
          ? "Too many attempts. Wait a few minutes before requesting another email."
          : "Could not send the email. Check your connection and try again.",
      );
    } finally {
      setBusy(false);
    }
  }

  function handleSignOut() {
    void signOutReleasingPushToken();
    setUser(null);
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title} accessibilityRole="header">
        Verify Your Email
      </Text>
      <Text style={styles.body}>
        We sent a verification link to{" "}
        <Text style={styles.email}>
          {firebaseUser?.email ?? "your email address"}
        </Text>
        . Open it to confirm the address is yours, then continue.
      </Text>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: busy, busy }}
        style={[styles.button, busy && styles.buttonDisabled]}
        onPress={handleContinue}
        disabled={busy}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>I&apos;ve Verified My Email</Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{ disabled: busy }}
        style={styles.secondaryButton}
        onPress={handleResend}
        disabled={busy}
      >
        <Text style={styles.secondaryText}>Send the Email Again</Text>
      </TouchableOpacity>

      <TouchableOpacity
        accessibilityRole="button"
        style={styles.linkButton}
        onPress={handleSignOut}
        disabled={busy}
      >
        <Text style={styles.linkText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 32,
    gap: 16,
    backgroundColor: "#f5f5f0",
  },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: "#1a472a",
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    color: "#444",
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 8,
  },
  email: { fontWeight: "700", color: "#111" },
  button: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: {
    borderWidth: 1,
    borderColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  secondaryText: { color: "#1a472a", fontSize: 15, fontWeight: "600" },
  linkButton: { alignItems: "center", paddingVertical: 8 },
  linkText: { color: "#888", fontSize: 14 },
});
