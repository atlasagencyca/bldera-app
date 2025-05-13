import { Tabs } from "expo-router";
import {
  TouchableOpacity,
  View,
  Text,
  Animated,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState, useRef } from "react";
import * as SecureStore from "expo-secure-store";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";
import tw from "twrnc";

export default function Layout() {
  const router = useRouter();
  const [userName, setUserName] = useState("User");
  const [unreadCount, setUnreadCount] = useState(0);
  const [userRole, setUserRole] = useState(null);
  const [activeTab, setActiveTab] = useState("clock-in-out");
  const animatedValue = useRef(new Animated.Value(0)).current;

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

  // Animation for active tab
  const handleTabPress = (tabName) => {
    setActiveTab(tabName);
    Animated.timing(animatedValue, {
      toValue: tabName === "clock-in-out" ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
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
        tabBarStyle: {
          backgroundColor: "#4B5563", // Dark gray background
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 4,
          height: 100,

          paddingTop: 0,
          marginBottom: -50,
        },
        tabBarItemStyle: {
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        },
      }}
    >
      <Tabs.Screen
        name="clock-in-out"
        options={{
          title: "Clock In/Out",
          tabBarIcon: ({ focused }) => (
            <Feather
              name="clock"
              size={24}
              color={focused ? "#fd9a00" : "#f8f9fa"}
            />
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? "#fd9a00" : "#f8f9fa",
                fontSize: 12,
                fontWeight: focused ? "bold" : "normal",
              }}
            >
              Clock In/Out
            </Text>
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              style={styles.tabButton}
              onPress={() => {
                props.onPress();
                handleTabPress("clock-in-out");
              }}
            >
              <View style={styles.tabContent}>
                {props.children}
                {activeTab === "clock-in-out" && (
                  <View style={styles.activeIndicator} />
                )}
              </View>
            </TouchableOpacity>
          ),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: "Projects",
          tabBarIcon: ({ focused }) => (
            <FontAwesome6
              name="building"
              size={24}
              color={focused ? "#fd9a00" : "#f8f9fa"}
            />
          ),
          tabBarLabel: ({ focused }) => (
            <Text
              style={{
                color: focused ? "#fd9a00" : "#f8f9fa",
                fontSize: 12,
                fontWeight: focused ? "bold" : "normal",
              }}
            >
              Projects
            </Text>
          ),
          tabBarButton: isSiteWorker
            ? () => null
            : (props) => (
                <TouchableOpacity
                  {...props}
                  style={styles.tabButton}
                  onPress={() => {
                    props.onPress();
                    handleTabPress("projects");
                  }}
                >
                  <View style={styles.tabContent}>
                    {props.children}
                    {activeTab === "projects" && (
                      <View style={styles.activeIndicator} />
                    )}
                  </View>
                </TouchableOpacity>
              ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 5,
  },
  tabContent: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  activeIndicator: {
    position: "absolute",
    bottom: -5,
    width: 40,
    height: 3,
    backgroundColor: "#fd9a00",
    borderRadius: 2,
  },
});
