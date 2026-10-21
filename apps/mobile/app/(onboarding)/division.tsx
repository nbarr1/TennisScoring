import React, { useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import type { TextInput } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "../../components/KeyboardSafeView";
import {
  useAuthUser,
  createDivision,
  joinDivisionByCode,
  getDivision,
  signOutReleasingPushToken,
} from "@tennis/firebase-client";
import { useAppStore } from "../../store/appStore";
import { FormErrorSummary, FormField } from "../../components/FormField";
import { AppIcon, ICON_COLOR, ICON_SIZE } from "../../components/AppIcon";
import {
  Button,
  InlineAlert,
  colors,
  confirmAction,
  describeError,
  elevations,
  radii,
  spacing,
  typography,
  useAsyncAction,
} from "../../theme";

type Mode = "choose" | "create" | "join";

export default function DivisionOnboardingScreen() {
  const [mode, setMode] = useState<Mode>("choose");
  const [divisionName, setDivisionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const divisionNameRef = useRef<TextInput>(null);
  const inviteCodeRef = useRef<TextInput>(null);
  const router = useRouter();
  const { firebaseUser } = useAuthUser();
  const setUser = useAppStore((s) => s.setUser);
  const setDivisionId = useAppStore((s) => s.setDivisionId);
  const tutorialDone = useAppStore((s) => !!s.user?.tutorialDone);
  const insets = useSafeAreaInsets();
  // A new player goes on to the tutorial; replacing straight to the tabs here
  // used to skip it for good.
  const nextRoute = tutorialDone ? "/(tabs)" : "/(onboarding)/tutorial";

  const signOut = useAsyncAction(async () => {
    try {
      await signOutReleasingPushToken();
    } finally {
      setUser(null);
    }
  });

  async function handleSignOut() {
    const ok = await confirmAction({
      title: "Sign out?",
      message: `You're signed in as ${firebaseUser?.email ?? "this account"}. You can sign back in at any time.`,
      confirmLabel: "Sign out",
    });
    if (ok) void signOut.run();
  }

  const create = useAsyncAction(
    async (name: string, uid: string) => {
      const divId = await createDivision(name, uid, {
        displayName: firebaseUser?.displayName ?? undefined,
        email: firebaseUser?.email ?? undefined,
      });
      const division = await getDivision(divId);
      return { divId, code: division?.inviteCode ?? "" };
    },
    {
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't create the division. Check your connection and try again.",
        ),
      onSuccess: ({ divId, code }) => {
        setDivisionId(divId);
        Alert.alert(
          "Division created",
          code
            ? `Share invite code ${code} with players so they can join. You can find it again on the Admin tab.`
            : "Invite players from the Admin tab.",
          [{ text: "Continue", onPress: () => router.replace(nextRoute) }],
        );
      },
    },
  );

  const join = useAsyncAction(
    (code: string, uid: string) => joinDivisionByCode(code, uid),
    {
      errorMessage: (err) =>
        describeError(
          err,
          "Couldn't join with that code. Check it with your division leader and try again.",
        ),
      onSuccess: ({ divisionId, divisionName: name }) => {
        setDivisionId(divisionId);
        Alert.alert(
          `You joined ${name}`,
          "You can now see standings, propose matches, and message players.",
          [{ text: "Continue", onPress: () => router.replace(nextRoute) }],
        );
      },
    },
  );

  function handleCreate() {
    if (!divisionName.trim()) {
      setErrors({ divisionName: "Enter a name for the division." });
      divisionNameRef.current?.focus();
      return;
    }
    if (!firebaseUser) return;
    void create.run(divisionName.trim(), firebaseUser.uid);
  }

  function handleJoin() {
    if (inviteCode.length !== 6) {
      setErrors({ inviteCode: "Enter all 6 characters of the invite code." });
      inviteCodeRef.current?.focus();
      return;
    }
    if (!firebaseUser) return;
    void join.run(inviteCode.trim(), firebaseUser.uid);
  }

  function choose(next: Mode) {
    setErrors({});
    create.reset();
    join.reset();
    setMode(next);
  }

  const cardStyle = ({ pressed }: { pressed: boolean }) => [
    styles.choiceCard,
    pressed && Platform.OS === "ios" && styles.choicePressed,
  ];

  return (
    <KeyboardAwareScrollView
      keyboardViewStyle={styles.container}
      contentContainerStyle={[
        styles.inner,
        { paddingTop: insets.top + spacing.xxl },
      ]}
    >
      <View style={styles.header}>
        <AppIcon
          name="figure.tennis"
          size={ICON_SIZE.brand}
          color={ICON_COLOR.active}
          emphasized
        />
        <Text style={styles.title} accessibilityRole="header">
          {mode === "create"
            ? "Create a division"
            : mode === "join"
              ? "Join a division"
              : "Find your division"}
        </Text>
        <Text style={styles.subtitle}>
          {mode === "create"
            ? "You'll be its leader: you run the roster, seasons, and schedule."
            : mode === "join"
              ? "Ask your division leader for the code. It's also in your invite email."
              : "Your division is the group of players you schedule matches and share standings with."}
        </Text>
      </View>

      {mode === "choose" && (
        <View style={styles.choices}>
          <Pressable
            accessibilityRole="button"
            // Starts with the visible title, so saying it works with Voice
            // Control and Voice Access.
            accessibilityLabel="I have an invite code"
            accessibilityHint="Join a division with the code from your division leader"
            android_ripple={{ color: colors.primarySoft, foreground: true }}
            style={cardStyle}
            onPress={() => choose("join")}
          >
            <AppIcon
              name="link"
              size={ICON_SIZE.feature}
              color={ICON_COLOR.active}
            />
            <Text style={styles.choiceTitle}>I have an invite code</Text>
            <Text style={styles.choiceBody}>
              Join the division your leader set up. Most players start here.
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start a new division"
            accessibilityHint="Create a division and become its leader"
            android_ripple={{ color: colors.primarySoft, foreground: true }}
            style={cardStyle}
            onPress={() => choose("create")}
          >
            <AppIcon
              name="trophy.fill"
              size={ICON_SIZE.feature}
              color={ICON_COLOR.active}
            />
            <Text style={styles.choiceTitle}>Start a new division</Text>
            <Text style={styles.choiceBody}>
              For leaders setting up a league. You&apos;ll get a code to invite
              players.
            </Text>
          </Pressable>
        </View>
      )}

      {mode === "create" && (
        <View style={styles.form}>
          <FormField
            ref={divisionNameRef}
            label="Division name"
            required
            error={errors.divisionName}
            value={divisionName}
            onChangeText={(value) => {
              setDivisionName(value);
              if (errors.divisionName) setErrors({});
              if (create.error) create.reset();
            }}
            onBlur={() =>
              setErrors({
                divisionName: divisionName.trim()
                  ? ""
                  : "Enter a name for the division.",
              })
            }
            placeholder="e.g. Lunchtime Tennis League"
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={handleCreate}
          />
          <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />
          {create.error && (
            <InlineAlert
              tone="error"
              title="Couldn't create the division"
              message={create.error}
            />
          )}
          <Button
            label="Create division"
            pending={create.pending}
            fullWidth
            onPress={handleCreate}
          />
          <Button
            label="Back"
            accessibilityLabel="Back to division options"
            variant="quiet"
            disabled={create.pending}
            onPress={() => choose("choose")}
          />
        </View>
      )}

      {mode === "join" && (
        <View style={styles.form}>
          <FormField
            ref={inviteCodeRef}
            label="Invite code"
            required
            error={errors.inviteCode}
            helperText="6 letters or numbers. Spaces and dashes are removed for you."
            inputStyle={styles.codeInput}
            value={inviteCode}
            onChangeText={(t) => {
              setInviteCode(
                t
                  .toUpperCase()
                  .replace(/[^A-Z0-9]/g, "")
                  .slice(0, 6),
              );
              if (errors.inviteCode) setErrors({});
              if (join.error) join.reset();
            }}
            onBlur={() =>
              setErrors({
                inviteCode:
                  inviteCode.length === 6
                    ? ""
                    : "Enter all 6 characters of the invite code.",
              })
            }
            placeholder="ABC123"
            autoCapitalize="characters"
            autoCorrect={false}
            autoComplete="off"
            maxLength={6}
            returnKeyType="go"
            onSubmitEditing={handleJoin}
          />
          <FormErrorSummary errors={Object.values(errors).filter(Boolean)} />
          {join.error && (
            <InlineAlert
              tone="error"
              title="Couldn't join the division"
              message={join.error}
            />
          )}
          <Button
            label="Join division"
            pending={join.pending}
            fullWidth
            onPress={handleJoin}
          />
          <Button
            label="Back"
            accessibilityLabel="Back to division options"
            variant="quiet"
            disabled={join.pending}
            onPress={() => choose("choose")}
          />
        </View>
      )}

      <View style={styles.signOutRow}>
        <Text style={styles.signOutText}>
          Signed in as {firebaseUser?.email ?? "an unknown account"}
        </Text>
        {signOut.error && (
          <InlineAlert
            tone="error"
            title="Couldn't sign out"
            message={signOut.error}
          />
        )}
        <Button
          label="Not you? Sign out"
          variant="quiet"
          size="compact"
          pending={signOut.pending}
          disabled={create.pending || join.pending}
          onPress={() => void handleSignOut()}
        />
      </View>
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.canvas },
  inner: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    width: "100%",
    maxWidth: 520,
    alignSelf: "center",
  },
  header: { alignItems: "center", marginBottom: spacing.xxl, gap: spacing.sm },
  title: {
    ...typography.title,
    color: colors.primary,
    textAlign: "center",
  },
  subtitle: {
    ...typography.body,
    color: colors.textMuted,
    textAlign: "center",
  },

  choices: { gap: spacing.lg },
  choiceCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.xl,
    alignItems: "center",
    gap: spacing.xs,
    // Clips the ripple to the rounded corners on Android; on iOS it would
    // also clip the shadow.
    overflow: Platform.OS === "android" ? "hidden" : "visible",
    ...elevations.low,
  },
  choicePressed: { backgroundColor: colors.surfaceMuted },
  choiceTitle: {
    ...typography.heading,
    fontSize: 18,
    color: colors.primary,
    marginTop: spacing.sm,
    textAlign: "center",
  },
  choiceBody: {
    ...typography.bodySmall,
    color: colors.textMuted,
    textAlign: "center",
  },

  form: { gap: spacing.md },
  codeInput: {
    fontSize: 24,
    fontWeight: "700",
    letterSpacing: 8,
    textAlign: "center",
    color: colors.primary,
  },

  signOutRow: {
    alignItems: "center",
    marginTop: spacing.xxl,
    gap: spacing.xs,
  },
  signOutText: { ...typography.caption, color: colors.textMuted },
});
