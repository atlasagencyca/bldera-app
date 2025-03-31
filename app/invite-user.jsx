import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";

// Function to send the invite request to the backend
const sendInviteUser = async (token, userId, email, displayName) => {
  try {
    const response = await fetch(
      "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/auth/invite-user",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "X-User-ID": userId,
        },
        body: JSON.stringify({
          email,
          displayName,
          role: "site_worker", // Default role
        }),
      }
    );

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to send invitation");
    }
    return data;
  } catch (error) {
    throw error;
  }
};

// Function to fetch current user data
const fetchUserData = async (token, userId, email) => {
  try {
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

    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.message || "Failed to fetch user data");
    }
    return data.user;
  } catch (error) {
    throw error;
  }
};

export default function InviteUserScreen() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({
    id: "",
    role: "",
    isPaid: false,
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const router = useRouter();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const email = await SecureStore.getItemAsync("userEmail");
        const token = await SecureStore.getItemAsync("authToken");
        const userId = await SecureStore.getItemAsync("userId");

        if (!email || !token || !userId) {
          throw new Error("Missing authentication details");
        }

        const user = await fetchUserData(token, userId, email);
        setUserData({
          id: user.id || "",
          role: user.role || "",
          isPaid: user.isPaid || false,
        });

        if (!["admin", "foreman"].includes(user.role) || !user.isPaid) {
          Alert.alert(
            "Unauthorized",
            "Only admins or foremen with paid accounts can invite users."
          );
          router.back();
        }
      } catch (error) {
        console.error("Error loading user data:", error);
        Alert.alert("Error", error.message || "Failed to load user data.");
        router.back();
      } finally {
        setLoading(false);
      }
    };
    loadUserData();
  }, [router]);

  const handleInviteUser = async () => {
    if (!inviteEmail || !inviteName) {
      Alert.alert("Error", "Please enter both email and name.");
      return;
    }

    setLoading(true);
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");

      await sendInviteUser(token, userId, inviteEmail, inviteName);
      Alert.alert("Success", `Invitation sent to ${inviteEmail}`);
      setInviteEmail("");
      setInviteName("");
    } catch (error) {
      console.error("Error inviting user:", error);
      Alert.alert("Error", error.message || "Failed to send invitation.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <ActivityIndicator size="large" color="#1E90FF" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView contentContainerStyle={tw`p-6 pb-10`}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between mb-6`}>
          <TouchableOpacity
            style={tw`p-2 rounded-full bg-white shadow-md`}
            onPress={() => router.back()}
          >
            <Feather name="arrow-left" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-2xl font-semibold text-gray-900`}>
            Invite User
          </Text>
          <View style={tw`w-10`} />
        </View>

        {/* Invite Form */}
        <View style={tw`bg-white rounded-xl shadow-md p-5`}>
          <Text style={tw`text-xl font-semibold text-gray-900 mb-4 `}>
            Invite a New User
          </Text>
          <Text style={tw`text-gray-600 mb-4`}>
            Enter the details below to send an invitation to join Bldera.
          </Text>

          <TextInput
            style={tw`border border-gray-300 rounded-lg p-3 mb-3 text-gray-900`}
            placeholder="Enter full name"
            placeholderTextColor="#000000" // Black placeholder text
            value={inviteName}
            onChangeText={setInviteName}
            autoCapitalize="words"
          />
          <TextInput
            style={tw`border border-gray-300 rounded-lg p-3 mb-3 text-gray-900`}
            placeholder="Enter email address"
            placeholderTextColor="#000000" // Black placeholder text
            value={inviteEmail}
            onChangeText={setInviteEmail}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <TouchableOpacity
            style={tw`flex-row items-center bg-green-600 py-3 px-4 rounded-lg`}
            onPress={handleInviteUser}
            disabled={loading}
          >
            <Feather name="mail" size={20} color="white" style={tw`mr-3`} />
            <Text style={tw`text-white text-base font-medium`}>
              {loading ? "Sending..." : "Send Invitation"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
