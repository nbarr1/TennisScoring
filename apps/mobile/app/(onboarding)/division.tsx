import React, { useRef, useState } from "react";
import { colors } from "../../theme";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { signOut } from "firebase/auth";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import {
  auth,
  useAuthUser,
  createDivision,
  joinDivisionByCode,
  getDivision,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import { FormErrorSummary, FormField } from "../../components/FormField";
import { AppIcon, ICON_COLOR, ICON_SIZE } from "../../components/AppIcon";
import type { TextInput } from "react-native";

type Mode = "choose" | "create" | "join";

export default function DivisionOnboardingScreen() {
  const [mode, setMode] = useState<Mode>("choose");
  const [divisionName, setDivisionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const divisionNameRef = useRef<TextInput>(null);
  const inviteCodeRef = useRef<TextInput>(null);
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const setUser = useAppStore((s) => s.setUser);
  const setDivisionId = useAppStore((s) => s.setDivisionId);

  function handleSignOut() {
    Alert.alert(
      "Sign Out",
      `Sign out of ${firebaseUser?.email ?? "this account"}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            await signOut(auth);
            setUser(null);
          },
        },
      ],
    );
  }

  async function handleCreate() {
    if (!divisionName.trim()) {
      setErrors({ divisionName: "Enter a division name." });
      divisionNameRef.current?.focus();
      return;
    }
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const divId = await createDivision(
        divisionName.trim(),
        firebaseUser.uid,
        {
          displayName: firebaseUser.displayName ?? undefined,
          email: firebaseUser.email ?? undefined,
        },
      );
      const division = await getDivision(divId);
      setDivisionId(divId);
      Alert.alert(
        "Division Created!",
        `Invite others with code: ${division?.inviteCode ?? ""}`,
        [{ text: "Continue", onPress: () => router.replace("/(tabs)") }],
      );
    } catch {
      Alert.alert("Error", "Could not create division. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (inviteCode.length !== 6) {
      setErrors({ inviteCode: "Enter the 6-character invite code." });
      inviteCodeRef.current?.focus();
      return;
    }
    if (!firebaseUser) return;
    setLoading(true);
    try {
      const { divisionId, divisionName: name } = await joinDivisionByCode(
        inviteCode.trim(),
        firebaseUser.uid,
      );
      setDivisionId(divisionId);
      Alert.alert(
        `Joined ${name}!`,
        "You can now see rankings and create matches.",
        [{ text: "Continue", onPress: () => router.replace("/(tabs)") }],
      );
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Could not join division.";
      Alert.alert("Error", msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAwareScrollView
      keyboardViewStyle={styles.container}
      contentContainerStyle={styles.inner}
    >
      <View style={styles.header}>
        <AppIcon
          name="figure.tennis"
          size={ICON_SIZE.brand}
          color={ICON_COLOR.active}
          emphasized
        />
        <Text style={styles.title}>Join a Division</Text>
        <Text style={styles.subtitle}>
          Create a new division or join an existing one with an invite code.
        </Text>
      </View>

      {mode === "choose" && (
        <View style={styles.choices}>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Create a division"
            style={styles.choiceCard}
            onPress={() => setMode("create")}
          >
            <AppIcon
              name="trophy.fill"
              size={ICON_SIZE.feature}
              color={ICON_COLOR.active}
            />
            <Text style={styles.choiceTitle}>Create Division</Text>
            <Text style={styles.choiceBody}>
              Start a new league division and invite players.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Join a division"
            style={styles.choiceCard}
            onPress={() => setMode("join")}
          >
            <AppIcon
              name="link"
              size={ICON_SIZE.feature}
              color={ICON_COLOR.active}
            />
            <Text style={styles.choiceTitle}>Join Division</Text>
            <Text style={styles.choiceBody}>
              Enter an invite code from your division leader.
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "create" && (
        <View style={styles.form}>
          <FormField
            ref={divisionNameRef}
            label="Division Name"
            required
            error={errors.divisionName}
            value={divisionName}
            onChangeText={setDivisionName}
            onBlur={() =>
              setErrors({
                divisionName: divisionName.trim()
                  ? ""
                  : "Enter a division name.",
              })
            }
            placeholder="e.g. Company Tennis League"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Create Division</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setMode("choose")}
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "join" && (
        <View style={styles.form}>
          <FormField
            ref={inviteCodeRef}
            label="Invite Code"
            required
            error={errors.inviteCode}
            helperText="Codes contain 6 letters or numbers; spaces and dashes are removed."
            inputStyle={styles.codeInput}
            value={inviteCode}
            onChangeText={(t) =>
              setInviteCode(
                t
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6),
              )
            }
            onBlur={() =>
              setErrors({
                inviteCode:
                  inviteCode.length === 6
                    ? ""
                    : "Enter the 6-character invite code.",
              })
            }
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />
          <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.surface} />
            ) : (
              <Text style={styles.buttonText}>Join Division</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => setMode("choose")}
          >
            <Text style={styles.backText}>Back</Text>
          </TouchableOpacity>
        </View>
      )}

      <TouchableOpacity style={styles.signOutLink} onPress={handleSignOut}>
        <Text style={styles.signOutLinkText}>
          Not you? Signed in as {firebaseUser?.email ?? "unknown"} — Sign out
        </Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  inner: { flexGrow: 1, justifyContent: "center", padding: 32 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  title: {
    fontSize: 26,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: "center",
    lineHeight: 22,
  },

  choices: { gap: 16 },
  choiceCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
    elevation: 3,
  },
  choiceIcon: { fontSize: 36, marginBottom: 12 },
  choiceTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.primary,
    marginBottom: 6,
  },
  choiceBody: { fontSize: 14, color: colors.textMuted, textAlign: "center" },

  form: { gap: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#444" },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    fontSize: 15,
    color: "#111",
  },
  codeInput: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
    color: colors.primary,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.surface, fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", paddingVertical: 12 },
  backText: { color: colors.primary, fontSize: 14, fontWeight: "500" },

  signOutLink: { alignItems: "center", marginTop: 32, padding: 8 },
  signOutLinkText: { color: colors.textSubtle, fontSize: 13 },
});
