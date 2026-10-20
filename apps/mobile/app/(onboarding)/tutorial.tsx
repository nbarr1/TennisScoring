import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Animated,
  ActivityIndicator,
  useWindowDimensions,
  type PressableProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { auth, updateUserProfile } from "@tennis/firebase-client";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import {
  announce,
  colors,
  hitSlopFor,
  MIN_TOUCH_TARGET,
  radii,
  spacing,
  typography,
  useReduceMotion,
} from "../../theme";

const SLIDES = [
  {
    key: "arrange",
    icon: "calendar",
    title: "Propose your matches",
    body: "Pick an opponent in your division and propose a time. They accept, and the match is on your schedule.",
  },
  {
    key: "score",
    icon: "figure.tennis",
    title: "Score it or record it",
    body: "Score point by point on court, from your phone or watch, or enter the final set scores after you play.",
  },
  {
    key: "standings",
    icon: "trophy.fill",
    title: "Confirm and climb",
    body: "Your opponent confirms each result, and every confirmed result updates the standings.",
  },
] as const;

/** Text on Clubhouse Green: white body at 90% stays above 9:1. */
const ON_PRIMARY_MUTED = "rgba(255,255,255,0.9)";

export async function markTutorialDone() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateUserProfile(uid, { tutorialDone: true });
}

function DarkButton({
  label,
  filled = false,
  style,
  ...props
}: PressableProps & { label: string; filled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.accessibilityLabel ?? label}
      hitSlop={hitSlopFor(MIN_TOUCH_TARGET)}
      android_ripple={{
        color: filled ? "rgba(26,71,42,0.2)" : "rgba(255,255,255,0.2)",
        foreground: true,
      }}
      style={(state) => [
        styles.darkButton,
        filled && styles.darkButtonFilled,
        state.pressed && styles.darkButtonPressed,
        typeof style === "function" ? style(state) : style,
      ]}
      {...props}
    >
      <Text
        style={[styles.darkButtonText, filled && styles.darkButtonTextFilled]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function TutorialScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const { width: pageWidth, height } = useWindowDimensions();
  const compact = pageWidth < 380 || height < 700;
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listRef.current?.scrollToOffset({
      offset: currentIndex * pageWidth,
      animated: false,
    });
  }, [currentIndex, pageWidth]);

  async function finish(continueWithoutSaving = false) {
    if (isSaving) return;

    if (!continueWithoutSaving) {
      setIsSaving(true);
      setSaveError(false);
      try {
        await markTutorialDone();
      } catch {
        setSaveError(true);
        announce("Couldn't save your progress. Try again, or continue anyway.");
        return;
      } finally {
        setIsSaving(false);
      }
    }

    router.replace("/(tabs)");
  }

  function goTo(index: number) {
    listRef.current?.scrollToIndex({ index, animated: !reduceMotion });
    // Without animation there is no momentum-end event to update the index.
    if (reduceMotion) {
      setCurrentIndex(index);
      announce(SLIDES[index].title);
    }
  }

  function next() {
    if (currentIndex < SLIDES.length - 1) {
      goTo(currentIndex + 1);
    } else {
      void finish();
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {/* Light status-bar content on the Clubhouse Green background. */}
      <StatusBar style="light" />
      <View style={styles.topBar}>
        {!isLast && (
          <DarkButton
            label="Skip"
            accessibilityLabel="Skip tutorial"
            accessibilityHint="Goes straight to the app"
            disabled={isSaving}
            onPress={() => void finish()}
          />
        )}
      </View>

      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        style={styles.list}
        getItemLayout={(_, index) => ({
          length: pageWidth,
          offset: pageWidth * index,
          index,
        })}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e) => {
          const nextIndex = Math.min(
            SLIDES.length - 1,
            Math.max(0, Math.round(e.nativeEvent.contentOffset.x / pageWidth)),
          );
          setCurrentIndex(nextIndex);
          announce(SLIDES[nextIndex].title);
        }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.slide,
              compact && styles.slideCompact,
              { width: pageWidth },
            ]}
          >
            <View style={[styles.iconBadge, compact && styles.iconBadgeCompact]}>
              <AppIcon
                name={item.icon}
                size={compact ? ICON_SIZE.feature : ICON_SIZE.brand}
                color={colors.primary}
                emphasized
              />
            </View>
            <Text
              accessibilityRole="header"
              style={[styles.title, compact && styles.titleCompact]}
            >
              {item.title}
            </Text>
            <Text style={[styles.body, compact && styles.bodyCompact]}>
              {item.body}
            </Text>
          </View>
        )}
      />

      <View
        style={[
          styles.footer,
          compact && styles.footerCompact,
          { paddingBottom: Math.max(insets.bottom, spacing.lg) + spacing.sm },
        ]}
      >
        <View
          style={styles.dots}
          accessible
          accessibilityLabel={`Step ${currentIndex + 1} of ${SLIDES.length}`}
        >
          {SLIDES.map((slide, i) => {
            const inputRange = [
              (i - 1) * pageWidth,
              i * pageWidth,
              (i + 1) * pageWidth,
            ];
            const width = scrollX.interpolate({
              inputRange,
              outputRange: [8, 24, 8],
              extrapolate: "clamp",
            });
            const opacity = scrollX.interpolate({
              inputRange,
              outputRange: [0.4, 1, 0.4],
              extrapolate: "clamp",
            });
            return (
              <Animated.View
                key={slide.key}
                style={[styles.dot, { width, opacity }]}
              />
            );
          })}
        </View>
        <Text style={styles.progressText} importantForAccessibility="no" accessibilityElementsHidden>
          Step {currentIndex + 1} of {SLIDES.length}
        </Text>

        {saveError && (
          <View accessibilityRole="alert" style={styles.saveStatus}>
            <Text style={styles.saveStatusText}>
              Couldn&apos;t save that you finished the tutorial. It may show
              again next time you sign in.
            </Text>
            <View style={styles.saveActions}>
              <DarkButton label="Try again" onPress={() => void finish()} />
              <DarkButton
                label="Continue anyway"
                onPress={() => void finish(true)}
              />
            </View>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Get started" : "Next"}
          accessibilityHint={
            isLast ? "Opens the app" : `Shows step ${currentIndex + 2} of ${SLIDES.length}`
          }
          accessibilityState={{ disabled: isSaving, busy: isSaving }}
          disabled={isSaving}
          android_ripple={{ color: "rgba(26,71,42,0.2)", foreground: true }}
          style={({ pressed }) => [
            styles.nextBtn,
            pressed && styles.darkButtonPressed,
          ]}
          onPress={next}
        >
          {isSaving ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={styles.nextText}>
              {isLast ? "Get started" : "Next"}
            </Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  topBar: {
    minHeight: MIN_TOUCH_TARGET + spacing.sm,
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
    paddingHorizontal: spacing.lg,
  },
  list: { flex: 1 },

  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xxl + spacing.sm,
  },
  slideCompact: { paddingHorizontal: spacing.xl },
  iconBadge: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.xxl,
  },
  iconBadgeCompact: {
    width: 80,
    height: 80,
    borderRadius: 40,
    marginBottom: spacing.xl,
  },
  title: {
    ...typography.title,
    fontSize: 28,
    lineHeight: 34,
    color: colors.onPrimary,
    textAlign: "center",
    marginBottom: spacing.lg,
  },
  titleCompact: { fontSize: 24, lineHeight: 30, marginBottom: spacing.md },
  body: {
    ...typography.body,
    fontSize: 17,
    lineHeight: 26,
    color: ON_PRIMARY_MUTED,
    textAlign: "center",
    maxWidth: 440,
  },
  bodyCompact: { fontSize: 15, lineHeight: 22 },

  footer: {
    paddingHorizontal: spacing.xxl,
    paddingTop: spacing.lg,
    gap: spacing.md,
    alignItems: "center",
  },
  footerCompact: { paddingHorizontal: spacing.lg },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  progressText: {
    ...typography.label,
    color: ON_PRIMARY_MUTED,
  },
  saveStatus: {
    alignSelf: "stretch",
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  saveStatusText: {
    ...typography.bodySmall,
    color: colors.onPrimary,
    textAlign: "center",
  },
  saveActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: spacing.sm,
  },

  darkButton: {
    minHeight: MIN_TOUCH_TARGET,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  darkButtonFilled: { backgroundColor: colors.accent },
  darkButtonPressed: { opacity: 0.8 },
  darkButtonText: {
    ...typography.label,
    fontSize: 16,
    color: colors.onPrimary,
  },
  darkButtonTextFilled: { color: colors.primary },

  nextBtn: {
    alignSelf: "stretch",
    minHeight: 52,
    backgroundColor: colors.accent,
    borderRadius: radii.pill,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  nextText: {
    ...typography.subheading,
    fontWeight: "800",
    color: colors.primary,
  },
});
