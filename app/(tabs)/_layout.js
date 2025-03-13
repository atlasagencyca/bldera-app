import { Tabs } from "expo-router";
import {
  FontAwesome,
  Ionicons,
  MaterialIcons,
  AntDesign,
} from "@expo/vector-icons";
import { Stack } from "expo-router";
export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false, // Disable default header for all tabs
        tabBarActiveTintColor: "#1E90FF",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          backgroundColor: "#f8f9fa",
          borderTopWidth: 0,
          elevation: 0,
          paddingTop: 0,
          bottom: 0, // Set to 0 to align the tab bar flush with the bottom
          paddingBottom: 0, // Ensure no extra padding at the bottom
          marginBottom: -40, // Ensure no extra margin at the bottom
        },
        // Explicitly disable any header space
        headerStyle: {
          height: 0, // Force header height to 0
        },
        headerTitleStyle: {
          display: "none", // Hide any title space
        },
      }}
    >
      <Tabs.Screen
        name="clock-in-out"
        options={{
          title: "Clock In/Out",
          headerShown: false, // Explicitly disable header for this screen
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="access-time" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="material-order"
        options={{
          title: "Material Orders",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <Ionicons name="receipt" size={24} color={color} />
          ),
        }}
      />
      {/* <Tabs.Screen
        name="change-orders"
        options={{
          title: "Change Orders",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <FontAwesome name="exchange" size={24} color={color} />
          ),
        }}
      /> */}
      <Tabs.Screen
        name="pieceworker-time"
        options={{
          title: "Worksheets",
          headerShown: false,
          tabBarIcon: ({ color }) => (
            <AntDesign name="table" size={24} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
