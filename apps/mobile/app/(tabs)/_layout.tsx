import { Tabs } from "expo-router";
import { isPrivilegedRole } from "@tennis/shared";
import { useAppStore } from "../../store/appStore";
import { AppIcon, ICON_COLOR, ICON_SIZE } from "../../components/AppIcon";

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
      color={focused ? ICON_COLOR.active : ICON_COLOR.inactive}
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
        tabBarActiveTintColor: ICON_COLOR.active,
        tabBarInactiveTintColor: ICON_COLOR.inactive,
        headerStyle: { backgroundColor: "#1a472a" },
        headerTintColor: "#fff",
        headerTitleStyle: { fontWeight: "700" },
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
