import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  refreshEmailVerification,
  sendVerificationEmail,
  signOutReleasingPushToken,
  useAuthUser,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import {
  Button,
  InlineAlert,
  colors,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

/** Seconds to wait before another verification email can be requested. */
const RESEND_COOLDOWN_SECONDS = 60;

/**
 * Shown by the auth gate while the signed-in account's email address is not
 * verified. Once it is, the gate moves on to division selection by itself.
 */
export default function VerifyEmailScreen() {
  const { firebaseUser } = useAuthUser();
  const setUser = useAppStore((state) => state.setUser);
  const [notVerifiedYet, setNotVerifiedYet] = useState(false);
  const [resentAt, setResentAt] = useState<number | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const check = useAsyncAction(
    async () => {
      const verified = await refreshEmailVerification();
      setNotVerifiedYet(!verified);
      return verified;
    },
    {
      errorMessage:
        "Couldn't check your verification status. Check your connection and try again.",
      successMessage: (verified) =>
        verified ? "Email verified" : "Not verified yet",
      onError: (err) =>
        console.error("Failed to refresh verification status:", err),
    },
  );

  const resend = useAsyncAction(
    async () => {
      await sendVerificationEmail();
    },
    {
      errorMessage: (err) =>
        (err as { code?: string })?.code === "auth/too-many-requests"
          ? "Too many emails requested. Wait a few minutes, then send it again."
          : "Couldn't send the email. Check your connection and try again.",
      successMessage: "Verification email sent",
      onSuccess: () => {
        setResentAt(Date.now());
        setCooldown(RESEND_COOLDOWN_SECONDS);
      },
    },
  );

  const signOut = useAsyncAction(async () => {
    try {
      await signOutReleasingPushToken();
    } finally {
      setUser(null);
    }
  });

  const address = firebaseUser?.email ?? "your email address";
  const busy = check.pending || resend.pending || signOut.pending;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.container,
        {
          paddingTop: insets.top + spacing.xxl,
          paddingBottom: insets.bottom + spacing.xxl,
        },
      ]}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.iconWrap}>
        <AppIcon
          name="envelope"
          size={ICON_SIZE.brand}
          color={colors.courtGreen}
        />
      </View>
      <Text style={styles.title} accessibilityRole="header">
        Check your email
      </Text>
      <Text style={styles.body}>
        We sent a verification link to{" "}
        <Text style={styles.email}>{address}</Text>.
      </Text>

      <View style={styles.steps} accessibilityRole="list">
        <Text style={styles.step}>1. Open the email from Tennis League.</Text>
        <Text style={styles.step}>2. Tap the link to verify your address.</Text>
        <Text style={styles.step}>3. Come back here and tap Continue.</Text>
      </View>

      {notVerifiedYet && !check.error && (
        <InlineAlert
          tone="warning"
          title="Not verified yet"
          message="We haven't seen the link opened. Open it from the email, then tap Continue again."
          announce
        />
      )}
      {check.error && (
        <InlineAlert
          tone="error"
          title="Couldn't check"
          message={check.error}
        />
      )}

      <Button
        label="Continue"
        accessibilityHint="Checks whether you've opened the verification link"
        pending={check.pending}
        pendingLabel="Checking…"
        disabled={resend.pending || signOut.pending}
        fullWidth
        onPress={() => void check.run()}
      />

      {resentAt && !resend.error && (
        <InlineAlert
          tone="success"
          title="Email sent"
          message="We sent a new link. Check your inbox and spam folder. Only the newest link works."
        />
      )}
      {resend.error && (
        <InlineAlert
          tone="error"
          title="Couldn't send the email"
          message={resend.error}
        />
      )}

      <Button
        label={
          cooldown > 0
            ? `Send again in ${cooldown}s`
            : "Send the email again"
        }
        accessibilityLabel={
          cooldown > 0
            ? `Send the email again, available in ${cooldown} seconds`
            : "Send the email again"
        }
        variant="secondary"
        pending={resend.pending}
        disabled={cooldown > 0 || check.pending || signOut.pending}
        fullWidth
        onPress={() => void resend.run()}
      />

      <Text style={styles.hint}>
        Wrong address? Sign out and create the account again with the right
        email.
      </Text>
      {signOut.error && (
        <InlineAlert
          tone="error"
          title="Couldn't sign out"
          message={signOut.error}
        />
      )}
      <Button
        label="Sign out"
        variant="quiet"
        pending={signOut.pending}
        disabled={busy && !signOut.pending}
        onPress={() => void signOut.run()}
        style={styles.signOut}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.canvas },
  container: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.lg,
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  iconWrap: { alignItems: "center" },
  title: {
    ...typography.title,
    color: colors.primary,
    textAlign: "center",
  },
  body: {
    ...typography.body,
    color: colors.text,
    textAlign: "center",
  },
  email: { fontWeight: "700", color: colors.text },
  steps: {
    backgroundColor: colors.surface,
    borderRadius: radii.card,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  step: { ...typography.bodySmall, color: colors.text },
  hint: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.sm,
  },
  signOut: { alignSelf: "center" },
});
