import { Tabs } from "expo-router";
import { isPrivilegedRole } from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import { colors, typography } from "../../theme";

function TabIcon({
  focused,
  regular,
  active,
}: {
  focused: boolean;
  regular: React.ComponentProps<typeof AppIcon>["name"];
  active: React.ComponentProps<typeof AppIcon>["name"];
}) {
  return (
    <AppIcon
      name={focused ? active : regular}
      size={ICON_SIZE.tab}
      color={focused ? colors.primary : colors.textMuted}
      emphasized={focused}
    />
  );
}

export default function TabLayout() {
  // Selector, not destructuring: subscribing to the whole store re-rendered
  // the whole tab navigator on every unrelated write.
  const role = useAppStore((state) => state.user?.role);
  const isAdmin = isPrivilegedRole(role);

  return (
    <Tabs
      screenOptions={{
        // Inactive labels use the muted text token (5.4:1 on white) so they
        // stay readable; the active tab also switches to its filled icon, so
        // color is not the only cue.
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
        tabBarLabelStyle: { ...typography.caption, fontWeight: "600" },
        tabBarAllowFontScaling: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.onPrimary,
        headerTitleStyle: { fontWeight: "700", color: colors.onPrimary },
        sceneStyle: { backgroundColor: colors.canvas },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Rankings",
          tabBarIcon: ({ focused }) => (
            <TabIcon regular="trophy" active="trophy.fill" focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="matches"
        options={{
          title: "Matches",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              regular="figure.tennis"
              active="figure.tennis"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: "Messages",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              regular="bubble.left"
              active="bubble.left.fill"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              regular="person.crop.circle"
              active="person.crop.circle.fill"
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: "Admin",
          tabBarIcon: ({ focused }) => (
            <TabIcon
              regular="gearshape"
              active="gearshape.fill"
              focused={focused}
            />
          ),
          tabBarButton: isAdmin ? undefined : () => null,
        }}
      />
    </Tabs>
  );
}
