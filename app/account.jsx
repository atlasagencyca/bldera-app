import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  ScrollView,
} from "react-native";
import * as SecureStore from "expo-secure-store";
import { useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";

const formatRole = (role) => {
  const roleMap = {
    unassigned: "Unassigned",
    admin: "Admin",
    foreman: "Foreman",
    project_manager: "Project Manager",
    site_worker: "Site Worker",
    estimator: "Estimator",
  };
  return roleMap[role] || role;
};

export default function AccountScreen() {
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState({
    id: "",
    displayName: "User",
    email: "",
    role: "",
    company: { companyName: "" },
    appleId: null,
    isPaid: false,
    healthAndSafetyDocs: [],
  });
  const [crewMembers, setCrewMembers] = useState([]);
  const router = useRouter();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const email = await SecureStore.getItemAsync("userEmail");
        const token = await SecureStore.getItemAsync("authToken");
        const userId = await SecureStore.getItemAsync("userId");

        if (!email || !token || !userId) {
          throw new Error("Missing email, token, or user ID");
        }

        const userResponse = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${email}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-User-ID": userId,
            },
          }
        );

        if (!userResponse.ok) {
          const errorData = await userResponse.json();
          throw new Error(errorData.message || "Failed to fetch user data");
        }

        const userData = await userResponse.json();

        if (!userData.success) {
          throw new Error(userData.message || "User fetch unsuccessful");
        }

        setUserData({
          id: userData.user.id || "",
          displayName: userData.user.displayName || "User",
          email: userData.user.email || "",
          role: userData.user.role || "",
          company: userData.user.company || { companyName: "" },
          appleId: userData.user.appleId || null,
          isPaid: userData.user.isPaid || false,
          healthAndSafetyDocs: userData.user.healthAndSafetyDocs || [],
        });

        // Fetch crew members only if user is a foreman or admin
        if (
          userData.user.role === "foreman" ||
          userData.user.role === "admin"
        ) {
          const crewResponse = await fetch(
            `https://erp-production-72da01c8e651.herokuapp.com/api/users/`,
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-User-ID": userId,
              },
            }
          );

          if (!crewResponse.ok) {
            const errorData = await crewResponse.json();
            throw new Error(
              errorData.message || "Failed to fetch crew members"
            );
          }

          const crewData = await crewResponse.json();
          const siteWorkers = crewData.filter(
            (member) => member.role === "site_worker" && member.active
          );
          setCrewMembers(siteWorkers);
        }
      } catch (error) {
        console.error("Error fetching data:", error);
        Alert.alert(
          "Error",
          error.message || "Failed to load account information."
        );
        const displayName =
          (await SecureStore.getItemAsync("userName")) || "User";
        const email = (await SecureStore.getItemAsync("userEmail")) || "";
        setUserData((prev) => ({ ...prev, displayName, email }));
      } finally {
        setLoading(false);
      }
    };
    loadUserData();
  }, []);

  const handleSignOut = async () => {
    try {
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
      router.replace("/");
    } catch (error) {
      console.error("Sign out error:", error);
      Alert.alert("Error", "Failed to sign out.");
    }
  };

  const handleDeleteAccount = async () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              const token = await SecureStore.getItemAsync("authToken");
              const email = await SecureStore.getItemAsync("userEmail");
              const userId = await SecureStore.getItemAsync("userId");

              const response = await fetch(
                `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${encodeURIComponent(
                  email
                )}`,
                {
                  method: "DELETE",
                  headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    "X-User-ID": userId,
                  },
                }
              );

              if (!response.ok) {
                const errorData = await response.json();
                throw new Error(
                  errorData.message || "Failed to delete account"
                );
              }

              const data = await response.json();
              if (!data.success) {
                throw new Error(data.message || "Deletion unsuccessful");
              }

              await handleSignOut();
              Alert.alert(
                "Success",
                "Your account and data have been deleted."
              );
            } catch (error) {
              console.error("Error deleting account:", error);
              if (error.message.includes("Admin accounts")) {
                Alert.alert(
                  "Admin Restriction",
                  "Admin accounts must be deleted via the website unless using Sign In with Apple. Contact support at support@example.com if needed."
                );
              } else {
                Alert.alert(
                  "Error",
                  error.message || "Failed to delete account."
                );
              }
            }
          },
        },
      ]
    );
  };

  const handleGoBack = () => {
    router.back();
  };

  const handleViewHealthSafetyDocs = () => {
    router.push({
      pathname: "/health-safety-docs",
      params: { userId: userData.id },
    });
  };

  const handleViewCrewMemberDocs = (crewMemberId) => {
    router.push({
      pathname: "/health-safety-docs",
      params: { userId: crewMemberId },
    });
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <ActivityIndicator size="large" color="#1E90FF" />
      </SafeAreaView>
    );
  }

  const isAnonymousAppleUser =
    userData.appleId ||
    userData.email.includes("@privaterelay.appleid.com") ||
    userData.email.includes("@anonymous.bldera.com");
  const canInvite =
    (userData.role === "admin" || userData.role === "foreman") &&
    userData.isPaid;
  const canViewCrew =
    (userData.role === "admin" || userData.role === "foreman") &&
    userData.isPaid;

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView contentContainerStyle={tw`p-6 pb-10`}>
        <View style={tw`flex-row items-center justify-between mb-6`}>
          <TouchableOpacity
            style={tw`p-2 rounded-full bg-white shadow-md`}
            onPress={handleGoBack}
          >
            <Feather name="arrow-left" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-2xl font-semibold text-gray-900`}>
            My Account
          </Text>
          <View style={tw`w-10`} />
        </View>

        <View style={tw`bg-white rounded-xl shadow-md p-5 mb-6`}>
          <Text style={tw`text-xl font-semibold text-gray-900 mb-4`}>
            Profile Details
          </Text>
          <View style={tw`mb-3`}>
            <Text style={tw`text-sm text-gray-500`}>Name</Text>
            <Text style={tw`text-lg text-gray-900`}>
              {userData.displayName}
            </Text>
          </View>
          <View style={tw`mb-3`}>
            <Text style={tw`text-sm text-gray-500`}>Email</Text>
            <Text style={tw`text-lg text-gray-900`}>
              {isAnonymousAppleUser ? "Hidden (Apple Privacy)" : userData.email}
            </Text>
          </View>
          <View style={tw`mb-3`}>
            <Text style={tw`text-sm text-gray-500`}>Role</Text>
            <Text style={tw`text-lg text-gray-900`}>
              {formatRole(userData.role)}
            </Text>
          </View>
          {isAnonymousAppleUser && (
            <Text style={tw`text-sm text-gray-500 italic mt-2`}>
              Signed in with an anonymous or Apple ID
            </Text>
          )}
        </View>

        {/* Health & Safety Documents Section */}
        <View style={tw`bg-white rounded-xl shadow-md p-5 mb-6`}>
          <Text style={tw`text-xl font-semibold text-gray-900 mb-4`}>
            Health & Safety Documents
          </Text>
          <TouchableOpacity
            style={tw`flex-row items-center bg-blue-600 py-3 px-4 rounded-lg`}
            onPress={handleViewHealthSafetyDocs}
          >
            <Feather
              name="file-text"
              size={20}
              color="white"
              style={tw`mr-3`}
            />
            <Text style={tw`text-white text-base font-medium`}>
              View Documents
            </Text>
          </TouchableOpacity>
        </View>

        {/* My Crew Section (Only for Foreman/Admin) */}
        {canViewCrew && (
          <View style={tw`bg-white rounded-xl shadow-md p-5 mb-6`}>
            <Text style={tw`text-xl font-semibold text-gray-900 mb-4`}>
              My Crew
            </Text>
            {crewMembers.length > 0 ? (
              crewMembers.map((member) => (
                <TouchableOpacity
                  key={member._id}
                  style={tw`flex-row items-center justify-between py-3 border-b border-gray-200`}
                  onPress={() => handleViewCrewMemberDocs(member._id)}
                >
                  <View>
                    <Text style={tw`text-lg text-gray-900`}>
                      {member.displayName}
                    </Text>
                    <Text style={tw`text-sm text-gray-500`}>
                      {formatRole(member.role)}
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={20} color="#374151" />
                </TouchableOpacity>
              ))
            ) : (
              <Text style={tw`text-gray-500`}>No site workers found.</Text>
            )}
          </View>
        )}

        <View style={tw`bg-white rounded-xl shadow-md p-5`}>
          <Text style={tw`text-xl font-semibold text-gray-900 mb-4`}>
            Actions
          </Text>
          {canInvite && (
            <TouchableOpacity
              style={tw`flex-row items-center bg-blue-600 py-3 px-4 rounded-lg mb-3`}
              onPress={() => router.push("/invite-user")}
            >
              <Feather
                name="user-plus"
                size={20}
                color="white"
                style={tw`mr-3`}
              />
              <Text style={tw`text-white text-base font-medium`}>
                Invite User
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={tw`flex-row items-center bg-blue-600 py-3 px-4 rounded-lg mb-3`}
            onPress={handleSignOut}
          >
            <Feather name="log-out" size={20} color="white" style={tw`mr-3`} />
            <Text style={tw`text-white text-base font-medium`}>Sign Out</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={tw`flex-row items-center bg-red-600 py-3 px-4 rounded-lg`}
            onPress={handleDeleteAccount}
          >
            <Feather name="trash-2" size={20} color="white" style={tw`mr-3`} />
            <Text style={tw`text-white text-base font-medium`}>
              Delete Account
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
