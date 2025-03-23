import React, { useState, useEffect } from "react";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  ActivityIndicator,
  Alert,
  Image,
  TouchableOpacity,
  SafeAreaView,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import tw from "twrnc";

const tenantID = "9d6df540-19fa-4585-8615-37183a530b0f8";
const clientID = "a6dd00fe-d3e8-4540-927a-e U42f5046e5cb";
const redirectUrl = "bldera://redirect";

export default function MicrosoftLoginScreen() {
  const [loading, setLoading] = useState(true);
  const [discovery, setDiscovery] = useState(null);
  const [authRequest, setAuthRequest] = useState(null);
  const router = useRouter();

  useEffect(() => {
    getSession();
    checkAuth();
  }, []);

  const getSession = async () => {
    try {
      const discoveryDoc = await AuthSession.fetchDiscoveryAsync(
        `https://login.microsoftonline.com/${tenantID}/v2.0`
      );
      setDiscovery(discoveryDoc);

      const authRequestOptions = {
        prompt: AuthSession.Prompt.Login,
        responseType: AuthSession.ResponseType.Code,
        scopes: ["openid", "profile", "email"],
        usePKCE: true,
        clientId: clientID,
        redirectUri: redirectUrl,
      };

      const authRequest = new AuthSession.AuthRequest(authRequestOptions);
      setAuthRequest(authRequest);
    } catch (error) {
      console.error("Error during session setup:", error);
    } finally {
      setLoading(false);
    }
  };

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      if (token) {
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await response.json();
        const isClockedIn = !!data.isClockedIn;

        router.replace({
          pathname: "/(tabs)/clock-in-out",
          params: {
            clockedIn: isClockedIn.toString(),
            clockData: JSON.stringify(data),
          },
        });
      }
    } catch (error) {
      console.error("Error checking auth token or clock status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleMicrosoftLogin = async () => {
    if (!authRequest || !discovery) {
      Alert.alert("Error", "Authentication not ready. Please try again.");
      return;
    }

    try {
      setLoading(true);
      const authorizeResult = await authRequest.promptAsync(discovery);

      if (authorizeResult.type === "success") {
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId: clientID,
            code: authorizeResult.params.code,
            redirectUri: redirectUrl,
            extraParams: { code_verifier: authRequest.codeVerifier },
          },
          discovery
        );

        const { accessToken } = tokenResult;
        if (!accessToken)
          throw new Error("Missing access token from Microsoft");

        const userInfoResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        const userData = await userInfoResponse.json();
        const email = userData.mail || userData.userPrincipalName;
        const displayName =
          userData.displayName || userData.givenName || "User";
        const microsoftId = userData.id;

        const backendResponse = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/auth/login",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ microsoftId, email, displayName }),
          }
        );
        const backendData = await backendResponse.json();

        if (!backendData.success) {
          throw new Error(backendData.message || "Backend login failed");
        }

        await handleLoginSuccess(backendData);
      }
    } catch (error) {
      console.error("Microsoft login error:", error);
      Alert.alert(
        "Login Error",
        error.message || "Failed to log in with Microsoft"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (data) => {
    if (data.user.role !== "foreman" && data.user.role !== "admin") {
      Alert.alert(
        "Access Denied",
        "You must be an admin or foreman to use this app."
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

    router.replace({
      pathname: "/(tabs)/clock-in-out",
      params: {
        clockedIn: (!!clockData.isClockedIn).toString(),
        clockData: JSON.stringify(clockData),
      },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 justify-center items-center bg-gray-900`}>
        <ActivityIndicator size="large" color="#1e3a8a" />
      </SafeAreaView>
    );
  }

  return (
    <LinearGradient
      colors={["#182e6e", "#344d95"]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={tw`flex-1`}
    >
      <SafeAreaView style={tw`flex-1 justify-center items-center px-6`}>
        <Image
          source={require("../assets/images/bldera.png")}
          style={tw`w-48 h-48 mb-8`}
          resizeMode="contain"
        />
        <Text style={tw`text-3xl font-extrabold text-white mb-4 text-center`}>
          Microsoft Login
        </Text>
        <TouchableOpacity
          style={tw`bg-white rounded-full py-4 px-8 flex-row items-center shadow-lg`}
          onPress={handleMicrosoftLogin}
        >
          <Image
            source={require("../assets/images/Microsoft_logo.png")}
            style={tw`w-6 h-6 mr-3`}
            resizeMode="contain"
          />
          <Text style={tw`text-blue-900 text-lg font-semibold`}>
            Sign in with Microsoft
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={tw`mt-4`}
          onPress={() => router.push("/login")}
        >
          <Text style={tw`text-white text-lg underline`}>
            Back to Login Options
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    </LinearGradient>
  );
}
