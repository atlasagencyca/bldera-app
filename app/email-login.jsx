import React, { useState, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  SafeAreaView,
  TextInput,
  Image,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Keyboard,
  Platform,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";

export default function EmailLoginScreen() {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const router = useRouter();

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      if (token) {
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        router.replace("/(tabs)/clock-in-out");
      }
    } catch (error) {
      console.error("Error checking auth:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailLogin = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/auth/login-email",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }
      );
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Email login failed");
      await handleLoginSuccess(data);
    } catch (error) {
      console.error("Email login error:", error);
      Alert.alert(
        "Login Error",
        error.message || "Failed to log in with email"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (data) => {
    const allowedRoles = [
      "foreman",
      "site_worker",
      "estimator",
      "project_manager",
    ];

    if (!allowedRoles.includes(data.user.role)) {
      Alert.alert(
        "Access Denied",
        "You must be an admin, foreman, site worker, estimator, or project manager to login."
      );
      return;
    }

    await SecureStore.setItemAsync("authToken", data.token);
    await SecureStore.setItemAsync("userName", data.user.displayName);
    await SecureStore.setItemAsync("userEmail", data.user.email);
    await SecureStore.setItemAsync("userId", data.user.id);

    const clockResponse = await fetch(
      "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
      { headers: { Authorization: `Bearer ${data.token}` } }
    );
    const clockData = await clockResponse.json();
    router.replace("/(tabs)/clock-in-out");
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 justify-center items-center bg-gray-900`}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient
      colors={["#1e3a8a", "#3b82f6"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={tw`flex-1`}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={tw`flex-1`}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
        >
          <SafeAreaView style={tw`flex-1 items-center px-6`}>
            <Image
              source={require("../assets/images/bldera.png")}
              style={tw`w-40 h-40 mt-10 mb-8`}
              resizeMode="contain"
            />
            <Text style={tw`text-4xl font-bold text-white mb-3 text-center`}>
              Email Sign In
            </Text>
            <Text
              style={tw`text-base text-gray-200 mb-8 text-center max-w-xs leading-6`}
            >
              Enter your credentials to access your account
            </Text>
            <View style={tw`w-full max-w-sm mb-10`}>
              <TextInput
                style={tw`bg-white bg-opacity-95 rounded-xl p-4 mb-4 text-black shadow-md`}
                placeholder="Email"
                placeholderTextColor="#6b7280"
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={tw`bg-white bg-opacity-95 rounded-xl p-4 mb-6 text-black shadow-md`}
                placeholder="Password"
                placeholderTextColor="#6b7280"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
              />
              <TouchableOpacity
                style={tw`bg-blue-500 rounded-xl py-4 px-6 flex-row items-center justify-center shadow-lg`}
                onPress={handleEmailLogin}
              >
                <Feather
                  name="log-in"
                  size={24}
                  color="white"
                  style={tw`mr-3`}
                />
                <Text style={tw`text-white text-lg font-medium`}>Sign In</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              style={tw`mb-10 flex-row items-center`}
              onPress={() => router.push("/")}
            >
              <Feather
                name="arrow-left"
                size={20}
                color="white"
                style={tw`mr-2`}
              />
              <Text style={tw`text-white text-base font-medium`}>
                Back to Options
              </Text>
            </TouchableOpacity>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </LinearGradient>
  );
}
