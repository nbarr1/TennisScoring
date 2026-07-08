import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Constants from "expo-constants";
import {
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from "expo-router";
import {
  submitFeedback,
  useAuthUser,
  useUserProfile,
} from "@tennis/firebase-client";
import { KeyboardAwareScrollView } from "../components/KeyboardSafeView";

export default function FeedbackScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const segments = useSegments();
  const params = useLocalSearchParams<{ from?: string }>();
  const { firebaseUser } = useAuthUser();
  const { profile } = useUserProfile(firebaseUser?.uid ?? null);

  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const appVersion = useMemo(
    () => Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    [],
  );

  async function handleSubmit() {
    const trimmedCategory = category.trim();
    const trimmedMessage = message.trim();

    if (!trimmedCategory || !trimmedMessage) {
      Alert.alert(
        "Missing details",
        "Please enter both a category and a message.",
      );
      return;
    }

    if (!firebaseUser) {
      Alert.alert("Not signed in", "Please sign in before sending feedback.");
      return;
    }

    setSubmitting(true);
    try {
      await submitFeedback({
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email ?? null,
        userDisplayName:
          profile?.displayName ?? firebaseUser.displayName ?? null,
        category: trimmedCategory,
        message: trimmedMessage,
        source: "mobile",
        platform: Platform.OS,
        appVersion,
        nativeAppVersion: Constants.nativeAppVersion ?? null,
        nativeBuildVersion: Constants.nativeBuildVersion ?? null,
        screen: params.from ?? pathname,
        screenContext: {
          from: params.from ?? null,
          pathname,
          segments: [...segments],
        },
      });

      setCategory("");
      setMessage("");
      Alert.alert("Feedback sent", "Thanks for helping us improve!", [
        { text: "OK", onPress: () => router.back() },
      ]);
    } catch (error) {
      Alert.alert(
        "Could not send feedback",
        (error as { message?: string }).message || "Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      keyboardViewStyle={styles.keyboardView}
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View style={styles.header}>
        <Text style={styles.title}>Provide feedback</Text>
        <Text style={styles.subtitle}>
          Tell us what is working, what is confusing, or what you would like to
          see next.
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.label}>Category</Text>
        <TextInput
          accessibilityLabel="Feedback category"
          style={styles.input}
          value={category}
          onChangeText={setCategory}
          placeholder="Bug, feature request, scoring, profile…"
          autoCapitalize="sentences"
          returnKeyType="next"
        />

        <Text style={styles.label}>Message</Text>
        <TextInput
          accessibilityLabel="Feedback message"
          style={[styles.input, styles.messageInput]}
          value={message}
          onChangeText={setMessage}
          placeholder="Share as much detail as you can."
          multiline
          textAlignVertical="top"
        />
      </View>

      <View style={styles.contextCard}>
        <Text style={styles.contextTitle}>Included automatically</Text>
        <Text style={styles.contextText}>Source: mobile</Text>
        <Text style={styles.contextText}>Platform: {Platform.OS}</Text>
        {appVersion ? (
          <Text style={styles.contextText}>App version: {appVersion}</Text>
        ) : null}
        <Text style={styles.contextText}>
          Screen: {params.from ?? pathname}
        </Text>
      </View>

      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="Send feedback"
        accessibilityState={{ disabled: submitting, busy: submitting }}
        style={[styles.submitBtn, submitting && styles.btnDisabled]}
        onPress={handleSubmit}
        disabled={submitting}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.submitBtnText}>Send Feedback</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: "#f5f5f0" },
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  content: { padding: 24, gap: 16 },
  header: { gap: 8 },
  title: { color: "#1a1a1a", fontSize: 28, fontWeight: "700" },
  subtitle: { color: "#666", fontSize: 15, lineHeight: 22 },
  section: {
    backgroundColor: "#fff",
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  label: { color: "#1a472a", fontSize: 14, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: "#fff",
  },
  messageInput: { minHeight: 160 },
  contextCard: {
    backgroundColor: "#e8f5e9",
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  contextTitle: {
    color: "#1a472a",
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  contextText: { color: "#436b4b", fontSize: 13 },
  submitBtn: {
    backgroundColor: "#1a472a",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
