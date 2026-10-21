import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { isPrivilegedRole } from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { AppIcon, ICON_SIZE } from "../../components/AppIcon";
import { typography, useColors } from "../../theme";

function TabIcon({
  focused,
  regular,
  active,
}: {
  focused: boolean;
  regular: React.ComponentProps<typeof AppIcon>["name"];
  active: React.ComponentProps<typeof AppIcon>["name"];
}) {
  const colors = useColors();
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
  const colors = useColors();
  // Selector, not destructuring: subscribing to the whole store re-rendered
  // the whole tab navigator on every unrelated write.
  const role = useAppStore((state) => state.user?.role);
  const isAdmin = isPrivilegedRole(role);

  return (
    <>
      {/* Light status-bar content on the Clubhouse Green headers. Screens
          pushed above the tabs (feedback, privacy, scheduler, conversations)
          share the green header, so they keep this style. */}
      <StatusBar style="light" />
      <Tabs
        screenOptions={{
          // Inactive labels use the muted text token (5.4:1 on white, 7.4:1 on the dark surface) so they
          // stay readable; the active tab also switches to its filled icon, so
          // color is not the only cue.
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarLabelStyle: { ...typography.caption, fontWeight: "600" },
          tabBarAllowFontScaling: true,
          headerStyle: { backgroundColor: colors.brand },
          headerTintColor: colors.onBrand,
          headerTitleStyle: { fontWeight: "700", color: colors.onBrand },
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
    </>
  );
}
