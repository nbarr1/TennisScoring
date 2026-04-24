import { useEffect } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import { registerFcmToken } from '@tennis/firebase-client';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export function useNotifications(userId: string | null | undefined) {
  const router = useRouter();

  useEffect(() => {
    if (!userId) return;

    async function setup() {
      const { status: existing } = await Notifications.getPermissionsAsync();
      let status = existing;
      if (existing !== 'granted') {
        const { status: requested } = await Notifications.requestPermissionsAsync();
        status = requested;
      }
      if (status !== 'granted') return;

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Tennis League',
          importance: Notifications.AndroidImportance.HIGH,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#1a472a',
        });
      }

      const token = await Notifications.getDevicePushTokenAsync();
      await registerFcmToken(userId, token.data as string);
    }

    setup().catch(() => {});

    const tapSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as {
        type?: string;
        matchId?: string;
        channelId?: string;
      };
      if (
        (data.type === 'report_submitted' || data.type === 'report_disputed') &&
        data.matchId
      ) {
        router.push(`/match/${data.matchId}` as never);
      } else if (data.type === 'message') {
        router.push('/(tabs)/messages' as never);
      }
    });

    return () => tapSub.remove();
  }, [userId]);
}
