import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useRouter } from "expo-router";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import {
  useAuthUser,
  createDivision,
  joinDivisionByCode,
  getDivision,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";

type Mode = "choose" | "create" | "join";

export default function DivisionOnboardingScreen() {
  const [mode, setMode] = useState<Mode>("choose");
  const [divisionName, setDivisionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const setDivisionId = useAppStore((s) => s.setDivisionId);

  async function handleCreate() {
    if (!divisionName.trim()) {
      Alert.alert("Required", "Please enter a division name.");
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
    if (!inviteCode.trim()) {
      Alert.alert("Required", "Please enter an invite code.");
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
        <Text style={styles.logo}>🎾</Text>
        <Text style={styles.title}>Join a Division</Text>
        <Text style={styles.subtitle}>
          Create a new division or join an existing one with an invite code.
        </Text>
      </View>

      {mode === "choose" && (
        <View style={styles.choices}>
          <TouchableOpacity
            style={styles.choiceCard}
            onPress={() => setMode("create")}
          >
            <Text style={styles.choiceIcon}>🏆</Text>
            <Text style={styles.choiceTitle}>Create Division</Text>
            <Text style={styles.choiceBody}>
              Start a new league division and invite players.
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.choiceCard}
            onPress={() => setMode("join")}
          >
            <Text style={styles.choiceIcon}>🔗</Text>
            <Text style={styles.choiceTitle}>Join Division</Text>
            <Text style={styles.choiceBody}>
              Enter an invite code from your division leader.
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "create" && (
        <View style={styles.form}>
          <Text style={styles.label}>Division Name</Text>
          <TextInput
            style={styles.input}
            value={divisionName}
            onChangeText={setDivisionName}
            placeholder="e.g. Company Tennis League"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
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
          <Text style={styles.label}>Invite Code</Text>
          <TextInput
            style={[styles.input, styles.codeInput]}
            value={inviteCode}
            onChangeText={(t) => setInviteCode(t.toUpperCase())}
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={6}
            returnKeyType="done"
            onSubmitEditing={handleJoin}
          />
          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleJoin}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
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
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f0" },
  inner: { flexGrow: 1, justifyContent: "center", padding: 32 },
  header: { alignItems: "center", marginBottom: 40 },
  logo: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", color: "#1a472a", marginBottom: 8 },
  subtitle: {
    fontSize: 15,
    color: "#666",
    textAlign: "center",
    lineHeight: 22,
  },

  choices: { gap: 16 },
  choiceCard: {
    backgroundColor: "#fff",
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
    color: "#1a472a",
    marginBottom: 6,
  },
  choiceBody: { fontSize: 14, color: "#666", textAlign: "center" },

  form: { gap: 14 },
  label: { fontSize: 14, fontWeight: "600", color: "#444" },
  input: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ddd",
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
    color: "#1a472a",
  },
  button: {
    backgroundColor: "#1a472a",
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  backBtn: { alignItems: "center", paddingVertical: 12 },
  backText: { color: "#1a472a", fontSize: 14, fontWeight: "500" },
});
