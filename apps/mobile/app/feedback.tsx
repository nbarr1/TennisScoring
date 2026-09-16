import React, { useMemo, useState } from "react";
import { colors } from "../theme";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
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
import { FormErrorSummary, FormField } from "../components/FormField";
import type { TextInput } from "react-native";

const MESSAGE_LIMIT = 2000;

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
  const [errors, setErrors] = useState<Record<string, string>>({});
  const categoryRef = useRef<TextInput>(null);
  const messageRef = useRef<TextInput>(null);
  const validate = (field: "category" | "message") =>
    field === "category"
      ? category.trim()
        ? ""
        : "Enter a feedback category."
      : message.trim()
        ? ""
        : "Tell us what happened or what you would like to see.";

  const appVersion = useMemo(
    () => Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? null,
    [],
  );

  async function handleSubmit() {
    const trimmedCategory = category.trim();
    const trimmedMessage = message.trim();

    const nextErrors = {
      category: validate("category"),
      message: validate("message"),
    };
    setErrors(nextErrors);
    if (nextErrors.category || nextErrors.message) {
      (nextErrors.category ? categoryRef : messageRef).current?.focus();
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
      setErrors({});
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
        <FormField
          ref={categoryRef}
          label="Category"
          required
          error={errors.category}
          accessibilityLabel="Feedback category"
          value={category}
          onChangeText={setCategory}
          onBlur={() =>
            setErrors((e) => ({ ...e, category: validate("category") }))
          }
          placeholder="Bug, feature request, scoring, profile…"
          autoCapitalize="sentences"
          returnKeyType="next"
          onSubmitEditing={() => messageRef.current?.focus()}
        />

        <FormField
          ref={messageRef}
          label="Message"
          required
          error={errors.message}
          accessibilityLabel="Feedback message"
          inputStyle={styles.messageInput}
          value={message}
          onChangeText={setMessage}
          onBlur={() =>
            setErrors((e) => ({ ...e, message: validate("message") }))
          }
          placeholder="Share as much detail as you can."
          multiline
          textAlignVertical="top"
          maxLength={MESSAGE_LIMIT}
          showCharacterCount
        />
      </View>

      <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />

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
          <ActivityIndicator color={colors.surface} />
        ) : (
          <Text style={styles.submitBtnText}>Send Feedback</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  keyboardView: { flex: 1, backgroundColor: colors.canvas },
  container: { flex: 1, backgroundColor: colors.canvas },
  content: { padding: 24, gap: 16 },
  header: { gap: 8 },
  title: { color: colors.text, fontSize: 28, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 15, lineHeight: 22 },
  section: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  label: { color: colors.primary, fontSize: 14, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: colors.surface,
  },
  messageInput: { minHeight: 160 },
  contextCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 16,
    gap: 4,
  },
  contextTitle: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  contextText: { color: "#436b4b", fontSize: 13 },
  submitBtn: {
    backgroundColor: colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitBtnText: { color: colors.surface, fontWeight: "700", fontSize: 15 },
  btnDisabled: { opacity: 0.5 },
});
