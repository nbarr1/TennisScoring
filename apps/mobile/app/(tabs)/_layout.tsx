import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { isPrivilegedRole } from '@tennis/shared';
import { useAppStore } from '../../store/appStore';

function TabIcon({ label, focused }: { label: string; focused: boolean }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{label}</Text>;
}

export default function TabLayout() {
  // Selector, not destructuring: subscribing to the whole store re-rendered
  // the whole tab navigator on every unrelated write.
  const role = useAppStore((state) => state.user?.role);
  const isAdmin = isPrivilegedRole(role);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: '#1a472a',
        tabBarInactiveTintColor: '#999',
        headerStyle: { backgroundColor: '#1a472a' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Rankings',
          tabBarIcon: ({ focused }) => <TabIcon label="🏆" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: 'Matches',
          tabBarIcon: ({ focused }) => <TabIcon label="🎾" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: 'Messages',
          tabBarIcon: ({ focused }) => <TabIcon label="💬" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ focused }) => <TabIcon label="👤" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: 'Admin',
          tabBarIcon: ({ focused }) => <TabIcon label="⚙️" focused={focused} />,
          tabBarButton: isAdmin ? undefined : () => null,
        }}
      />
    </Tabs>
  );
}
