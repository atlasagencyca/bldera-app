// app/notifications.js
import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  FlatList,
  ActivityIndicator,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter, useNavigation } from "expo-router";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInDown } from "react-native-reanimated";

const STATUS_COLORS = {
  unread: "#2563eb",
  read: "#9ca3af",
};

const NotificationCard = ({ item, onMarkAsRead }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Animated.View entering={FadeInDown.duration(300)}>
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => !item.isRead && onMarkAsRead(item._id)}
        onPressIn={() => setIsHovered(true)}
        onPressOut={() => setIsHovered(false)}
        style={tw`mb-3 rounded-xl overflow-hidden shadow-lg`}
      >
        <LinearGradient
          colors={item.isRead ? ["#ffffff", "#f9fafb"] : ["#f8fafc", "#eff6ff"]}
          style={tw`p-5`}
        >
          <View style={tw`flex-row justify-between items-start`}>
            <View style={tw`flex-1 pr-4`}>
              <View style={tw`flex-row items-center justify-between`}>
                <Text
                  style={tw`text-base font-medium text-gray-900 tracking-tight`}
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <View
                  style={tw`w-2.5 h-2.5 rounded-full`}
                  backgroundColor={
                    item.isRead ? STATUS_COLORS.read : STATUS_COLORS.unread
                  }
                />
              </View>
              <Text
                style={tw`mt-1 text-sm text-gray-600 leading-5`}
                numberOfLines={2}
              >
                {item.body}
              </Text>
              <Text style={tw`mt-2 text-xs text-gray-400`}>
                {new Date(item.createdAt).toLocaleString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </Text>
            </View>
          </View>
          {isHovered && (
            <View style={tw`absolute inset-0 bg-black bg-opacity-5`} />
          )}
        </LinearGradient>
      </TouchableOpacity>
    </Animated.View>
  );
};

export default function NotificationsScreen() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const navigation = useNavigation();

  const fetchNotifications = async () => {
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
        setNotifications(data.notifications);
      }
    } catch (error) {
      console.error("Error fetching notifications:", error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (notificationId) => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/notifications/${notificationId}/read`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-User-ID": userId,
          },
        }
      );
      if (response.ok) {
        setNotifications((prev) =>
          prev.map((n) =>
            n._id === notificationId ? { ...n, isRead: true } : n
          )
        );
      }
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

  useEffect(() => {
    fetchNotifications();
    // Add pull-to-refresh capability
    const unsubscribe = navigation.addListener("focus", fetchNotifications);
    return unsubscribe;
  }, [navigation]);

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 bg-gray-100`}>
        <View style={tw`flex-1 justify-center items-center`}>
          <ActivityIndicator size="large" color="#2563eb" />
          <Text style={tw`mt-4 text-gray-600 font-medium`}>
            Loading notifications...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-100`}>
      <View style={tw`px-5 pt-6 pb-4 border-b border-gray-200 bg-white`}>
        <View style={tw`flex-row items-center justify-between`}>
          <TouchableOpacity
            style={tw`p-2 -ml-2`}
            onPress={() => navigation.goBack()}
          >
            <Feather name="arrow-left" size={24} color="#111827" />
          </TouchableOpacity>
          <Text style={tw`text-xl font-semibold text-gray-900`}>
            Notifications
          </Text>
          <View style={tw`w-10`} />
        </View>
      </View>

      <FlatList
        data={notifications}
        renderItem={({ item }) => (
          <NotificationCard item={item} onMarkAsRead={markAsRead} />
        )}
        keyExtractor={(item) => item._id}
        contentContainerStyle={tw`p-4`}
        ListEmptyComponent={
          <View style={tw`flex-1 justify-center items-center py-20`}>
            <Feather name="bell-off" size={48} color="#9ca3af" />
            <Text style={tw`mt-4 text-gray-600 font-medium text-base`}>
              No notifications yet
            </Text>
            <Text style={tw`mt-1 text-gray-500 text-sm text-center px-4`}>
              You'll see notifications here when there's something to report
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
        refreshing={loading}
        onRefresh={fetchNotifications}
      />
    </SafeAreaView>
  );
}
