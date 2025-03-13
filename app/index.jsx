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
  ImageBackground,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import tw from "twrnc";

const tenantID = "1fcc3432-dcdf-4922-b3f0-d25dc17f88e8";
const clientID = "282285d2-feca-4d80-80fb-2aae33bdf1ad";
const redirectUrl = "bldera://redirect";

export default function LoginScreen() {
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
        // Fetch clock-in/out status from backend
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        const data = await response.json();
        const isClockedIn = !!data.isClockedIn;

        // Pass the full clock-in data to the ClockScreen
        router.replace({
          pathname: "/(tabs)/clock-in-out",
          params: {
            clockedIn: isClockedIn.toString(),
            clockData: JSON.stringify(data), // Pass the entire clock data object
          },
        });
      } else {
        console.log("here");
      }
    } catch (error) {
      console.error("Error checking auth token or clock status:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
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
        if (!accessToken) {
          throw new Error("Missing access token from Microsoft");
        }

        const userInfoResponse = await fetch(
          "https://graph.microsoft.com/v1.0/me",
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
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

        if (
          backendData.user.role === "foreman" ||
          backendData.user.role === "admin"
        ) {
          const finalToken = backendData.token;

          await SecureStore.setItemAsync("authToken", finalToken);
          await SecureStore.setItemAsync(
            "userName",
            backendData.user.displayName
          );
          await SecureStore.setItemAsync("userEmail", backendData.user.email);

          await SecureStore.setItemAsync("userId", backendData.user.id);
          // Fix: Ensure userId is stored as a string

          const clockResponse = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
            { headers: { Authorization: `Bearer ${finalToken}` } }
          );
          const clockData = await clockResponse.json();

          router.replace({
            pathname: "/(tabs)/clock-in-out",
            params: {
              clockedIn: (!!clockData.isClockedIn).toString(),
              clockData: JSON.stringify(clockData),
            },
          });
        } else {
          Alert.alert(
            "Access Denied",
            "You must be an admin or foreman to use this app."
          );
          await SecureStore.deleteItemAsync("authToken");
          await SecureStore.deleteItemAsync("userName");
          await SecureStore.deleteItemAsync("userEmail");
        }
      }
    } catch (error) {
      console.error("Error during login:", error);
      Alert.alert(
        "Login Error",
        error.message || "Failed to log in with Microsoft."
      );
    } finally {
      setLoading(false);
    }
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
      colors={["#182e6e", "#344d95"]} // Navy blue to a lighter blue for gradient
      start={{ x: 0, y: 0 }} // Top-left start
      end={{ x: 1, y: 1 }} // Bottom-right end
      style={tw`flex-1`}
    >
      <View style={tw`flex-1 bg-black bg-opacity-20`}>
        {/* Reduced opacity for subtle overlay */}
        <SafeAreaView style={tw`flex-1 justify-center items-center px-6`}>
          <Image
            source={require("../assets/images/bldera.png")}
            style={tw`w-48 h-48 mb-8`}
            resizeMode="contain"
          />
          <Text style={tw`text-3xl font-extrabold text-white mb-4 text-center`}>
            Welcome to Bldera
          </Text>
          <Text style={tw`text-lg text-gray-200 mb-10 text-center max-w-md`}>
            Log in to your account to manage time cards, track projects, and
            stay productive on the go.
          </Text>
          <TouchableOpacity
            style={tw`bg-white rounded-full py-4 px-8 flex-row items-center shadow-lg`}
            onPress={handleLogin}
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
          <Text style={tw`text-gray-400 text-sm mt-12`}>
            Powered by Bldera © 2025
          </Text>
        </SafeAreaView>
      </View>
    </LinearGradient>
  );
}
