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
  Platform,
} from "react-native";
import * as AuthSession from "expo-auth-session";
import * as SecureStore from "expo-secure-store";
import * as AppleAuthentication from "expo-apple-authentication";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Updates from "expo-updates";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";

// Configure notification handler for foreground notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

const clientID = "a6dd00fe-d3e8-4540-927a-e42f5046e5cb";
const redirectUrl = "msauth.com.bldera://auth";

export default function LoginScreen() {
  const [loading, setLoading] = useState(true);
  const [discovery, setDiscovery] = useState(null);
  const [authRequest, setAuthRequest] = useState(null);
  const router = useRouter();

  useEffect(() => {
    const initialize = async () => {
      try {
        await checkForUpdates();
        await getSession();
        await checkAuth();
      } catch (error) {
        console.error("Initialization error:", error);
        setLoading(false);
      }
    };
    initialize();
  }, []);

  const checkForUpdates = async () => {
    try {
      if (__DEV__) {
        console.log("Skipping update check in development mode");
        return;
      }
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        console.log("New update available, fetching...");
        await Updates.fetchUpdateAsync();
        console.log("Update fetched, reloading app...");
        await Updates.reloadAsync();
      } else {
        console.log("No updates available");
      }
    } catch (error) {
      console.error("Error checking for updates:", error);
      Alert.alert(
        "Update Check Failed",
        "Unable to check for updates. Continuing with current version."
      );
    }
  };

  const getSession = async () => {
    try {
      // Use the common endpoint for multi-tenant authentication
      const discoveryDoc = await AuthSession.fetchDiscoveryAsync(
        "https://login.microsoftonline.com/common/v2.0"
      );
      setDiscovery(discoveryDoc);

      const authRequestOptions = {
        prompt: AuthSession.Prompt.Login,
        responseType: AuthSession.ResponseType.Code,
        scopes: ["openid", "profile", "email", "User.Read"], // Match frontend scopes
        usePKCE: true,
        clientId: clientID,
        redirectUri: redirectUrl,
      };

      const authRequest = new AuthSession.AuthRequest(authRequestOptions);
      setAuthRequest(authRequest);
    } catch (error) {
      console.error("Error during session setup:", error);
      await SecureStore.deleteItemAsync("authToken");
      await SecureStore.deleteItemAsync("userName");
      await SecureStore.deleteItemAsync("userEmail");
      await SecureStore.deleteItemAsync("userId");
      Alert.alert("Setup Error", "Failed to initialize authentication.");
    }
  };

  const checkAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");

      if (!token || !userId) {
        console.log("No existing auth token or userId found, prompting login");
        setLoading(false);
        return;
      }

      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
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
        throw new Error("Failed to fetch current timesheet");
      }

      const clockData = await response.json();
      const clockedIn = !!clockData.clockInStatus;

      if (clockedIn && clockData.timesheet) {
        await SecureStore.setItemAsync("clockInStatus", JSON.stringify(true));
        await SecureStore.setItemAsync(
          "clockInTime",
          clockData.timesheet.start
        );
        await SecureStore.setItemAsync("timesheetId", clockData.timesheet._id);
        await SecureStore.setItemAsync(
          "clockInData",
          JSON.stringify({
            start: clockData.timesheet.start,
            email: clockData.timesheet.email,
            user: clockData.timesheet.user,
            timesheetId: clockData.timesheet._id,
            locations: clockData.timesheet.locations || [],
            usePersonalVehicle: clockData.timesheet.usePersonalVehicle || false,
            timezone: clockData.timesheet.timezone || "America/Toronto",
            timezoneOffset: clockData.timesheet.timezoneOffset || 4,
            isOnline: true,
          })
        );
        await SecureStore.setItemAsync(
          "selectedProject",
          JSON.stringify({ projectName: clockData.timesheet.projectName })
        );
        await SecureStore.setItemAsync(
          "selectedWorkOrder",
          JSON.stringify({
            woNumber: clockData.timesheet.woNumber,
            title: clockData.timesheet.title || "N/A",
          })
        );
      } else {
        await SecureStore.setItemAsync("clockInStatus", JSON.stringify(false));
      }

      await registerForPushNotifications(token, userId);

      router.replace({
        pathname: "(tabs)/clock-in-out",
        params: {
          clockedIn: clockedIn.toString(),
          clockData: JSON.stringify(clockData),
        },
      });
    } catch (error) {
      console.error("Error checking auth or timesheet:", error);
      await SecureStore.deleteItemAsync("authToken");
      await SecureStore.deleteItemAsync("userName");
      await SecureStore.deleteItemAsync("userEmail");
      await SecureStore.deleteItemAsync("userId");
      await SecureStore.deleteItemAsync("clockInStatus");
      await SecureStore.deleteItemAsync("clockInTime");
      await SecureStore.deleteItemAsync("timesheetId");
      await SecureStore.deleteItemAsync("clockInData");
      await SecureStore.deleteItemAsync("selectedProject");
      await SecureStore.deleteItemAsync("selectedWorkOrder");
    } finally {
      setLoading(false);
    }
  };

  const registerForPushNotifications = async (token, userId) => {
    try {
      if (!Device.isDevice) {
        console.log("Push notifications require a physical device.");
        return;
      }

      const { status: existingStatus } =
        await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        Alert.alert(
          "Permission Denied",
          "Please enable notifications in your device settings."
        );
        return;
      }

      const projectId = Constants.expoConfig?.extra?.eas?.projectId;
      if (!projectId) {
        throw new Error("Project ID not found in app config.");
      }

      const pushToken = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      const expoPushToken = pushToken.data;

      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/register-push-token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
            "X-User-ID": userId,
          },
          body: JSON.stringify({ expoPushToken, userId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        console.error("Failed to register push token:", errorData.message);
      } else {
        console.log("Expo Push Token registered:", expoPushToken);
      }

      if (Platform.OS === "android") {
        await Notifications.setNotificationChannelAsync("default", {
          name: "Default",
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: "#FF231F7C",
        });
      }
    } catch (error) {
      console.error("Error registering for push notifications:", error);
    }
  };

  const handleMicrosoftLogin = async () => {
    if (!authRequest || !discovery) {
      Alert.alert("Error", "Authentication not ready.");
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
        if (!accessToken) throw new Error("Missing access token");

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

        if (!backendData.success)
          throw new Error(backendData.message || "Login failed");
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

  const handleAppleLogin = async () => {
    try {
      setLoading(true);
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });

      const { identityToken, email, fullName } = credential;
      if (!identityToken) throw new Error("Missing identity token");

      const displayName = fullName?.givenName
        ? `${fullName.givenName} ${fullName.familyName || ""}`.trim()
        : "User";
      const appleId = credential.user;

      const backendResponse = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/auth/login-apple",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appleId, email, displayName, identityToken }),
        }
      );
      const backendData = await backendResponse.json();

      if (
        !backendData.success &&
        backendData.message.includes("Contact your admin")
      ) {
        Alert.alert(
          "Company Assignment Needed",
          "Your account has been created. Please contact your admin to assign a company."
        );
        return;
      }

      if (!backendData.success)
        throw new Error(backendData.message || "Apple login failed");
      await handleLoginSuccess(backendData);
    } catch (error) {
      console.error("Apple login error:", error);
      Alert.alert(
        "Login Error",
        error.message || "Failed to log in with Apple"
      );
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSuccess = async (data) => {
    const allowedRoles = [
      "admin",
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
    await SecureStore.setItemAsync("userRole", data.user.role);
    await SecureStore.setItemAsync("userEmail", data.user.email);
    await SecureStore.setItemAsync("userId", data.user.id);

    const clockResponse = await fetch(
      "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/current",
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${data.token}`,
          "X-User-ID": data.user.id,
        },
      }
    );
    const clockData = await clockResponse.json();
    const clockedIn = !!clockData.clockInStatus;

    if (clockedIn && clockData.timesheet) {
      await SecureStore.setItemAsync("clockInStatus", JSON.stringify(true));
      await SecureStore.setItemAsync("clockInTime", clockData.timesheet.start);
      await SecureStore.setItemAsync("timesheetId", clockData.timesheet._id);
      await SecureStore.setItemAsync(
        "clockInData",
        JSON.stringify({
          start: clockData.timesheet.start,
          email: clockData.timesheet.email,
          user: clockData.timesheet.user,
          timesheetId: clockData.timesheet._id,
          locations: clockData.timesheet.locations || [],
          usePersonalVehicle: clockData.timesheet.usePersonalVehicle || false,
          timezone: clockData.timesheet.timezone || "America/Toronto",
          timezoneOffset: clockData.timesheet.timezoneOffset || 4,
          isOnline: true,
        })
      );
      await SecureStore.setItemAsync(
        "selectedProject",
        JSON.stringify({ projectName: clockData.timesheet.projectName })
      );
      await SecureStore.setItemAsync(
        "selectedWorkOrder",
        JSON.stringify({
          woNumber: clockData.timesheet.woNumber,
          title: clockData.timesheet.title || "N/A",
        })
      );
    } else {
      await SecureStore.setItemAsync("clockInStatus", JSON.stringify(false));
    }

    await registerForPushNotifications(data.token, data.user.id);

    router.replace({
      pathname: "(tabs)/clock-in-out",
      params: {
        clockedIn: clockedIn.toString(),
        clockData: JSON.stringify(clockData),
      },
    });
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
      <SafeAreaView style={tw`flex-1 justify-center items-center px-6 `}>
        <Image
          source={require("../assets/images/bldera.png")}
          style={tw`w-40 h-40 mb-10`}
          resizeMode="contain"
        />
        <Text style={tw`text-4xl font-bold text-white mb-3 text-center`}>
          Welcome Back
        </Text>
        <Text
          style={tw`text-base text-gray-200 mb-12 text-center max-w-xs leading-6`}
        >
          Sign in to manage your time cards and projects
        </Text>

        <TouchableOpacity
          style={tw`bg-white rounded-xl py-4 px-6 flex-row items-center justify-center shadow-lg mb-4 w-full max-w-sm`}
          onPress={handleMicrosoftLogin}
        >
          <Image
            source={require("../assets/images/Microsoft_logo.png")}
            style={tw`w-6 h-6 mr-3`}
            resizeMode="contain"
          />
          <Text style={tw`text-blue-900 text-lg font-medium`}>
            Microsoft Login
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={tw`bg-blue-500 rounded-xl py-4 px-6 flex-row items-center justify-center shadow-lg mb-4 w-full max-w-sm`}
          onPress={() => router.push("/email-login")}
        >
          <Feather name="mail" size={24} color="white" style={tw`mr-3`} />
          <Text style={tw`text-white text-lg font-medium`}>Email Login</Text>
        </TouchableOpacity>

        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={12}
          style={tw`w-full max-w-sm h-14 shadow-lg`}
          onPress={handleAppleLogin}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}
