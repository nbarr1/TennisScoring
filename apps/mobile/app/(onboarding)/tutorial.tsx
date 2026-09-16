import React, { useRef, useState } from "react";
import { colors } from "../../theme";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  Animated,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { auth, updateUserProfile } from "@tennis/firebase-client";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SLIDES = [
  {
    key: "welcome",
    icon: "🎾",
    title: "Welcome to Tennis League",
    body: "Track every match, climb the rankings, and stay connected with your division — all in one place.",
    bg: colors.primary,
  },
  {
    key: "live",
    icon: "🎯",
    title: "Score Live Matches",
    body: "Tap to record each point in real time. The app handles deuce, tiebreaks, and service changes automatically.",
    bg: "#2d6a4f",
  },
  {
    key: "historic",
    icon: "📋",
    title: "Record Past Matches",
    body: "Already played? Log the set scores after the fact. Your opponent confirms, and rankings update instantly.",
    bg: "#1b4332",
  },
  {
    key: "report",
    icon: "✅",
    title: "Confirm Match Reports",
    body: "After a match ends, one player submits the score. The other confirms or disputes — keeping everything fair.",
    bg: "#134a22",
  },
  {
    key: "messages",
    icon: "💬",
    title: "Message Teammates",
    body: "Chat in the division channel or start a direct message. Share your contact info with a single tap.",
    bg: "#0d3b1e",
  },
  {
    key: "ready",
    icon: "🏆",
    title: "You're All Set!",
    body: "Win matches, earn ranking points, and claim the top spot. Good luck on the court!",
    bg: colors.primary,
    isLast: true,
  },
] as const;

export async function markTutorialDone() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateUserProfile(uid, { tutorialDone: true });
}

export default function TutorialScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const compact = width < 380 || height < 700;
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;

  async function finish() {
    await markTutorialDone();
    router.replace("/(tabs)");
  }

  function next() {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      finish();
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <SafeAreaView edges={["top"]} style={styles.root}>
      <Animated.FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(s) => s.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { x: scrollX } } }],
          { useNativeDriver: false },
        )}
        onMomentumScrollEnd={(e) => {
          setCurrentIndex(
            Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH),
          );
        }}
        renderItem={({ item }) => (
          <View
            style={[
              styles.slide,
              { backgroundColor: item.bg, width: SCREEN_WIDTH },
            ]}
          >
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </ScrollView>
        )}
      />

      {/* Progress dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [(i - 1) * width, i * width, (i + 1) * width];
          const dotWidth = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: "clamp",
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.35, 1, 0.35],
            extrapolate: "clamp",
          });
          return (
            <Animated.View key={i} style={[styles.dot, { width, opacity }]} />
          );
        })}
      </View>

      <Text accessibilityLiveRegion="polite" style={styles.progressText}>
        Step {currentIndex + 1} of {SLIDES.length}
      </Text>

      {saveError && (
        <View accessibilityLiveRegion="polite" style={styles.saveStatus}>
          <Text style={styles.saveStatusText}>We couldn't save your progress.</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => finish()}>
            <Text style={styles.statusAction}>Retry</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={() => finish(true)}>
            <Text style={styles.statusAction}>Continue anyway</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Actions */}
      <SafeAreaView edges={["bottom"]} style={styles.footer}>
        <View style={[styles.actions, compact && styles.actionsCompact]}>
          {!isLast && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Skip tutorial"
              onPress={finish}
              style={styles.skipBtn}
            >
              <Text style={styles.skip}>Skip</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isLast ? "Get started" : "Next tutorial slide"}
            style={[styles.nextBtn, isLast && styles.nextBtnLast]}
            onPress={next}
          >
            <Text style={styles.nextText}>
              {isLast ? "Get Started" : "Next"}
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isLast ? "Get started" : "Next tutorial slide"}
          style={[styles.nextBtn, isLast && styles.nextBtnLast]}
          onPress={next}
        >
          <Text style={styles.nextText}>{isLast ? "Get Started" : "Next"}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },

  slide: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingBottom: 140,
  },
  slideContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    paddingBottom: 16,
  },
  slideCompact: { paddingHorizontal: 20 },
  icon: { fontSize: 80, marginBottom: 32 },
  iconCompact: { fontSize: 56, marginBottom: 16 },
  title: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.surface,
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 36,
  },
  body: {
    fontSize: 17,
    color: "rgba(255,255,255,0.8)",
    textAlign: "center",
    lineHeight: 26,
  },

  dots: {
    position: "absolute",
    bottom: Platform.OS === "ios" ? 110 : 100,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffdc60",
  },
  progressText: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 86 : 76,
    alignSelf: 'center',
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    fontWeight: '600',
  },
  saveStatus: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 166 : 150,
    left: 24,
    right: 24,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.72)',
  },
  saveStatusText: { width: '100%', color: '#fff', textAlign: 'center' },
  statusAction: { color: '#ffdc60', fontWeight: '700' },

  actions: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === "ios" ? 48 : 32,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  footer: { backgroundColor: "rgba(0,0,0,0.15)" },
  actionsCompact: { paddingHorizontal: 16, paddingVertical: 8 },
  skipBtn: { minWidth: 44, minHeight: 44, justifyContent: "center" },
  skip: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 16,
    fontWeight: "500",
  },
  nextBtn: {
    backgroundColor: "#ffdc60",
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    marginLeft: "auto",
  },
  nextBtnLast: {
    paddingHorizontal: 40,
  },
  nextText: {
    color: colors.primary,
    fontWeight: "800",
    fontSize: 16,
  },
});
