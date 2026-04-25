import React, { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Dimensions, Animated, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { auth, updateUserProfile } from '@tennis/firebase-client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SLIDES = [
  {
    key: 'welcome',
    icon: '🎾',
    title: 'Welcome to Tennis League',
    body: 'Track every match, climb the rankings, and stay connected with your division — all in one place.',
    bg: '#1a472a',
  },
  {
    key: 'live',
    icon: '🎯',
    title: 'Score Live Matches',
    body: 'Tap to record each point in real time. The app handles deuce, tiebreaks, and service changes automatically.',
    bg: '#2d6a4f',
  },
  {
    key: 'historic',
    icon: '📋',
    title: 'Record Past Matches',
    body: 'Already played? Log the set scores after the fact. Your opponent confirms, and rankings update instantly.',
    bg: '#1b4332',
  },
  {
    key: 'report',
    icon: '✅',
    title: 'Confirm Match Reports',
    body: 'After a match ends, one player submits the score. The other confirms or disputes — keeping everything fair.',
    bg: '#134a22',
  },
  {
    key: 'messages',
    icon: '💬',
    title: 'Message Teammates',
    body: 'Chat in the division channel or start a direct message. Share your contact info with a single tap.',
    bg: '#0d3b1e',
  },
  {
    key: 'ready',
    icon: '🏆',
    title: "You're All Set!",
    body: 'Win matches, earn ranking points, and claim the top spot. Good luck on the court!',
    bg: '#1a472a',
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
  const listRef = useRef<FlatList>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(0)).current;

  async function finish() {
    await markTutorialDone();
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
          setCurrentIndex(Math.round(e.nativeEvent.contentOffset.x / SCREEN_WIDTH));
        }}
        renderItem={({ item }) => (
          <View style={[styles.slide, { backgroundColor: item.bg, width: SCREEN_WIDTH }]}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      {/* Progress dots */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => {
          const inputRange = [
            (i - 1) * SCREEN_WIDTH,
            i * SCREEN_WIDTH,
            (i + 1) * SCREEN_WIDTH,
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

      {/* Actions */}
      <View style={styles.actions}>
        {!isLast && (
          <TouchableOpacity onPress={finish} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={styles.skip}>Skip</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={[styles.nextBtn, isLast && styles.nextBtnLast]}
          onPress={next}
        >
          <Text style={styles.nextText}>{isLast ? 'Get Started' : 'Next'}</Text>
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
