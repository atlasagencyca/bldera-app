import { Tabs } from "expo-router";
import { TouchableOpacity, View, Text } from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import tw from "twrnc";
import { SafeAreaView } from "react-native-safe-area-context";

export default function TabLayout() {
  const router = useRouter();
  const [userName, setUserName] = useState("User");
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState(null);

  const fetchUnreadNotifications = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/notifications",
        {
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-User-ID": userId,
          },
        }
      );
      const data = await response.json();
      if (data.success) {
        const unread = data.notifications.filter((n) => !n.isRead).length;
        setUnreadCount(unread);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    }
  };

  const fetchUserRole = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");
      const email = await SecureStore.getItemAsync("userEmail");

      if (!email || !token || !userId) {
        throw new Error("Missing email, token, or user ID");
      }

      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${encodeURIComponent(
          email
        )}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-User-ID": userId,
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to fetch user data");
      }

      const data = await response.json();
      if (data.success) {
        setUserRole(data.user.role || "unassigned");
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
  };

  useEffect(() => {
    const loadUserData = async () => {
      const name = await SecureStore.getItemAsync("userName");
      setUserName(name || "User");
      await fetchUnreadNotifications();
      await fetchUserRole();
    };
    loadUserData();

    const interval = setInterval(fetchUnreadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  const isSiteWorker = userRole === "site_worker";

  // Custom tab bar for site workers to center the single tab
  const renderTabBar = (props) => {
    if (!isSiteWorker) return null; // Use default tab bar for non-site workers

    const { state, descriptors, navigation } = props;
    const route = state.routes[0]; // Only "clock-in-out" is visible for site workers
    const { options } = descriptors[route.key];

    return (
      <SafeAreaView edges={["bottom"]}>
        <View style={tw`flex-row justify-center items-center pb-0 mb--12`}>
          <TouchableOpacity
            onPress={() => navigation.navigate(route.name)}
            style={tw`flex-col items-center justify-center p-2`}
          >
            {options.tabBarIcon({
              color: state.index === 0 ? "#1E90FF" : "gray",
            })}
            <Text
              style={tw`${
                state.index === 0 ? "text-[#1E90FF]" : "text-gray-500"
              } text-xs`}
            >
              {options.title}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  };

  return (
    <Tabs
      screenOptions={{
        header: () => (
          <View
            style={tw`bg-white p-4 flex-row items-center justify-between border-b border-gray-200`}
          >
            <TouchableOpacity
              onPress={() => router.push("/account")}
              style={tw`bg-gray-300 rounded-full p-2`}
            >
              <Feather name="user" size={24} color="#4B5563" />
            </TouchableOpacity>
            <Text style={tw`text-black text-lg font-bold`}>
              Welcome, {userName}
            </Text>
            <TouchableOpacity
              onPress={() => router.push("/notifications")}
              style={tw`relative`}
            >
              <Feather name="bell" size={24} color="#4B5563" />
              {unreadCount > 0 && (
                <View
                  style={tw`absolute -top-1 -right-1 bg-red-500 rounded-full w-5 h-5 flex items-center justify-center`}
                >
                  <Text style={tw`text-white text-xs`}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        ),
        tabBarActiveTintColor: "#1E90FF",
        tabBarInactiveTintColor: "gray",
        tabBarStyle: {
          backgroundColor: "#f8f9fa",
          borderTopWidth: 0,
          elevation: 0,
          paddingTop: 0,
          bottom: 0,
          paddingBottom: 0,
          marginBottom: -40,
        },
      }}
      tabBar={isSiteWorker ? renderTabBar : undefined} // Use custom tab bar only for site workers
    >
      <Tabs.Screen
        name="clock-in-out"
        options={{
          title: "Clock In/Out",
          tabBarIcon: ({ color }) => (
            <Feather name="clock" size={24} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="material-order"
        options={{
          title: "Material Orders",
          tabBarIcon: ({ color }) => (
            <Feather name="package" size={24} color={color} />
          ),
          tabBarButton: isSiteWorker ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="progressLogScreen"
        options={{
          title: "Progress Logs",
          tabBarIcon: ({ color }) => (
            <Ionicons name="journal-sharp" size={24} color={color} />
          ),
          tabBarButton: isSiteWorker ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="pieceworker-time"
        options={{
          title: "Worksheets",
          tabBarIcon: ({ color }) => (
            <Feather name="file-text" size={24} color={color} />
          ),
          tabBarButton: isSiteWorker ? () => null : undefined,
        }}
      />
      <Tabs.Screen
        name="time-and-material"
        options={{
          title: "T & M",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="timetable" size={24} color={color} />
          ),
          tabBarButton: isSiteWorker ? () => null : undefined,
        }}
      />
    </Tabs>
  );
}
