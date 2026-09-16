import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  AccessibilityInfo, Animated, Platform, useWindowDimensions,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth, updateUserProfile } from '@tennis/firebase-client';

const SLIDES = [
  {
    key: 'division',
    icon: '🎾',
    title: 'Find Your Division',
    body: 'Create a division for your group or join an existing one with an invite code.',
    bg: '#1a472a',
  },
  {
    key: 'arrange',
    icon: '📅',
    title: 'Arrange Your Matches',
    body: 'Schedule matches with players in your division and keep your season moving.',
    bg: '#2d6a4f',
  },
  {
    key: 'score',
    icon: '📋',
    title: 'Score or Record Results',
    body: 'Score point by point on court, or enter the final set scores after you play.',
    bg: '#1b4332',
  },
  {
    key: 'standings',
    icon: '🏆',
    title: 'Climb the Standings',
    body: 'Every confirmed result updates the rankings. Win matches, earn points, and chase the top spot.',
    bg: '#1a472a',
  },
] as const;

export async function markTutorialDone() {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await updateUserProfile(uid, { tutorialDone: true });
}

export default function TutorialScreen() {
  const router = useRouter();
  const { width: pageWidth } = useWindowDimensions();
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const scrollX = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    listRef.current?.scrollToOffset({ offset: currentIndex * pageWidth, animated: false });
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
        return;
      } finally {
        setIsSaving(false);
      }
    }

    router.replace('/(tabs)');
  }

  function next() {
    if (currentIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: currentIndex + 1, animated: true });
    } else {
      finish();
    }
  }

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.root}>
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
          { useNativeDriver: false }
        )}
        onMomentumScrollEnd={(e) => {
          const nextIndex = Math.min(
            SLIDES.length - 1,
            Math.max(0, Math.round(e.nativeEvent.contentOffset.x / pageWidth))
          );
          setCurrentIndex(nextIndex);
          AccessibilityInfo.announceForAccessibility(SLIDES[nextIndex].title);
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg, width: pageWidth }]}>
            <Text
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={styles.icon}
            >
              {item.icon}
            </Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Progress dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [
            (i - 1) * pageWidth,
            i * pageWidth,
            (i + 1) * pageWidth,
          ];
          const width = scrollX.interpolate({
            inputRange,
            outputRange: [8, 24, 8],
            extrapolate: 'clamp',
          });
          const opacity = scrollX.interpolate({
            inputRange,
            outputRange: [0.35, 1, 0.35],
            extrapolate: 'clamp',
          });
          return <Animated.View key={i} style={[styles.dot, { width, opacity }]} />;
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
      <View style={styles.actions}>
        {!isLast && (
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel="Skip tutorial"
            onPress={() => finish()}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={isLast ? 'Get started' : 'Next tutorial slide'}
          accessibilityState={{ disabled: isSaving }}
          disabled={isSaving}
          style={[styles.nextBtn, isLast && styles.nextBtnLast]}
          onPress={next}
        >
          <Text style={styles.nextText}>{isSaving ? 'Saving…' : isLast ? 'Get Started' : 'Next'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1a472a' },

  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingBottom: 140,
  },
  icon: { fontSize: 80, marginBottom: 32 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 36,
  },
  body: {
    fontSize: 17,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 26,
  },

  dots: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 110 : 100,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ffdc60',
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingBottom: Platform.OS === 'ios' ? 48 : 32,
    paddingTop: 16,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  skip: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
    fontWeight: '500',
  },
  nextBtn: {
    backgroundColor: '#ffdc60',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 28,
    marginLeft: 'auto',
  },
  nextBtnLast: {
    paddingHorizontal: 40,
  },
  nextText: {
    color: '#1a472a',
    fontWeight: '800',
    fontSize: 16,
  },
});
