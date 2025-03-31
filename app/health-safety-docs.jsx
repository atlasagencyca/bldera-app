import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Alert,
  Linking,
  TextInput,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import DateTimePickerModal from "react-native-modal-datetime-picker";
import { Feather } from "@expo/vector-icons";
import tw from "twrnc";

export default function HealthSafetyDocsScreen() {
  const [docs, setDocs] = useState([]);
  const [userRole, setUserRole] = useState(""); // Target user's role
  const [currentUserRole, setCurrentUserRole] = useState(""); // Current user's role
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [newDoc, setNewDoc] = useState({
    name: "",
    expiryDate: "",
    file: null,
    docId: null,
  });
  const router = useRouter();
  const { userId } = useLocalSearchParams();

  useEffect(() => {
    const fetchDocsAndRoles = async () => {
      try {
        const token = await SecureStore.getItemAsync("authToken");
        const storedUserId = await SecureStore.getItemAsync("userId");

        if (!token || !storedUserId) {
          throw new Error("Missing authentication details");
        }

        setCurrentUserId(storedUserId);

        // Fetch current user's role
        const currentUserResponse = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${await SecureStore.getItemAsync(
            "userEmail"
          )}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "X-User-ID": storedUserId,
            },
          }
        );

        if (!currentUserResponse.ok) {
          throw new Error("Failed to fetch current user data");
        }

        const currentUserData = await currentUserResponse.json();
        setCurrentUserRole(currentUserData.user.role || "");

        // Fetch target user's data
        const targetUserResponse = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/users/${userId}`,
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!targetUserResponse.ok) {
          const errorData = await targetUserResponse.json();
          throw new Error(errorData.message || "Failed to fetch documents");
        }

        const targetUserData = await targetUserResponse.json();
        setDocs(targetUserData.healthAndSafetyDocs || []);
        setUserRole(targetUserData.role || "");
      } catch (error) {
        console.error("Error fetching data:", error);
        Alert.alert("Error", "Failed to load documents.");
      } finally {
        setLoading(false);
      }
    };
    fetchDocsAndRoles();
  }, [userId]);

  const handleGoBack = () => {
    router.back();
  };

  const handleViewDocument = async (url) => {
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert("Error", "Cannot open this image URL.");
      }
    } catch (error) {
      console.error("Error opening image:", error);
      Alert.alert("Error", "Failed to open image.");
    }
  };

  const handleAddDocument = () => {
    setNewDoc({ name: "", expiryDate: "", file: null, docId: null });
    setIsEditing(false);
    setModalVisible(true);
  };

  const handleEditDocument = (doc) => {
    setNewDoc({
      name: doc.name,
      expiryDate: doc.expiryDate.split("T")[0], // Pre-fill with existing date
      file: null,
      docId: doc._id,
    });
    setIsEditing(true);
    setModalVisible(true);
  };

  const handlePickImage = async () => {
    try {
      const permissionResult =
        await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert("Error", "Camera permission is required to take a photo.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        setNewDoc((prev) => ({ ...prev, file: result.assets[0] }));
      }
    } catch (error) {
      console.error("Error picking image:", error);
      Alert.alert("Error", "Failed to capture image.");
    }
  };

  const handleDateConfirm = (date) => {
    const formattedDate = date.toISOString().split("T")[0]; // Format as YYYY-MM-DD
    setNewDoc((prev) => ({ ...prev, expiryDate: formattedDate }));
    setDatePickerVisible(false);
  };

  const handleSaveDocument = async () => {
    if (!newDoc.name || !newDoc.expiryDate) {
      Alert.alert("Error", "Please provide a name and expiry date.");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("authToken");
      const formData = new FormData();
      formData.append("name", newDoc.name);
      formData.append("expiryDate", newDoc.expiryDate);

      if (newDoc.file) {
        formData.append("document", {
          uri: newDoc.file.uri,
          type: newDoc.file.mimeType || "image/jpeg", // Default to JPEG for images
          name: newDoc.file.fileName || `photo-${Date.now()}.jpg`,
        });
      }

      const url = isEditing
        ? `https://erp-production-72da01c8e651.herokuapp.com/api/users/${userId}/documents/${newDoc.docId}`
        : `https://erp-production-72da01c8e651.herokuapp.com/api/users/${userId}/upload-doc`;

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "multipart/form-data",
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to save image");
      }

      const data = await response.json();
      if (isEditing) {
        setDocs((prev) =>
          prev.map((doc) => (doc._id === newDoc.docId ? data.doc : doc))
        );
      } else {
        setDocs((prev) => [...prev, data.doc]);
      }

      setModalVisible(false);
      setNewDoc({ name: "", expiryDate: "", file: null, docId: null });
      Alert.alert("Success", "Image saved successfully!");
    } catch (error) {
      console.error("Error saving image:", error);
      Alert.alert("Error", error.message || "Failed to save image.");
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <ActivityIndicator size="large" color="#1E90FF" />
      </SafeAreaView>
    );
  }

  const canAddOrEditDocuments =
    (currentUserRole === "foreman" || currentUserRole === "admin") &&
    (currentUserId !== userId || currentUserRole !== "site_worker");

  return (
    <SafeAreaView style={tw`flex-1 bg-gray-50`}>
      <ScrollView contentContainerStyle={tw`p-6 pb-20`}>
        {/* Header */}
        <View style={tw`flex-row items-center justify-between mb-6`}>
          <TouchableOpacity
            style={tw`p-2 rounded-full bg-white shadow-md`}
            onPress={handleGoBack}
          >
            <Feather name="arrow-left" size={24} color="#374151" />
          </TouchableOpacity>
          <Text style={tw`text-2xl font-semibold text-gray-900`}>
            Health & Safety
          </Text>
          <View style={tw`w-10`} />
        </View>

        {/* Documents Section */}
        <View style={tw`bg-white rounded-xl shadow-md p-5`}>
          <View style={tw`flex-row justify-between items-center mb-4`}>
            <Text style={tw`text-xl font-semibold text-gray-900`}>
              Documents
            </Text>
            {canAddOrEditDocuments && (
              <TouchableOpacity
                style={tw`flex-row items-center bg-indigo-600 py-2 px-4 rounded-lg`}
                onPress={handleAddDocument}
              >
                <Feather name="plus" size={28} color="white" style={tw`mr-2`} />
                <Text style={tw`text-white text-lg font-medium`}>Add</Text>
              </TouchableOpacity>
            )}
          </View>
          {docs.length > 0 ? (
            docs.map((doc) => (
              <TouchableOpacity
                key={doc._id}
                style={tw`py-4 border-b border-gray-200 flex-row justify-between items-center`}
                onPress={() => handleViewDocument(doc.url)}
              >
                <View>
                  <Text style={tw`text-lg font-medium text-gray-900`}>
                    {doc.name}
                  </Text>
                  <Text style={tw`text-sm text-gray-500 mt-1`}>
                    Expires: {new Date(doc.expiryDate).toLocaleDateString()}
                  </Text>
                  <Text
                    style={tw`text-sm ${
                      new Date(doc.expiryDate) > new Date()
                        ? "text-green-600"
                        : "text-red-600"
                    } mt-1`}
                  >
                    {new Date(doc.expiryDate) > new Date()
                      ? "Valid"
                      : "Expired"}
                  </Text>
                </View>
                <View style={tw`flex-row items-center`}>
                  {canAddOrEditDocuments && (
                    <TouchableOpacity
                      style={tw`mr-8`}
                      onPress={() => handleEditDocument(doc)}
                    >
                      <Feather name="edit" size={40} color="#374151" />
                    </TouchableOpacity>
                  )}
                  <Feather name="image" size={40} color="#374151" />
                </View>
              </TouchableOpacity>
            ))
          ) : (
            <Text style={tw`text-gray-500 text-base`}>
              No images available.
            </Text>
          )}
        </View>
      </ScrollView>

      {/* Add/Edit Document Modal (Only for Foreman/Admin) */}
      {canAddOrEditDocuments && (
        <Modal
          animationType="slide"
          transparent={true}
          visible={modalVisible}
          onRequestClose={() => setModalVisible(false)}
        >
          <View
            style={tw`flex-1 justify-center items-center bg-gray-900 bg-opacity-50`}
          >
            <View
              style={tw`bg-white rounded-xl p-6 w-11/12 max-w-md shadow-md`}
            >
              <Text style={tw`text-xl font-semibold text-gray-900 mb-4`}>
                {isEditing ? "Edit Document" : "Add Health & Saftey Document"}
              </Text>
              <TextInput
                style={tw`border border-gray-300 rounded-md p-3 mb-4 text-gray-900`}
                placeholder="Image Name"
                value={newDoc.name}
                onChangeText={(text) =>
                  setNewDoc((prev) => ({ ...prev, name: text }))
                }
              />
              <TouchableOpacity
                style={tw`border border-gray-300 rounded-md p-3 mb-4 flex-row items-center justify-between`}
                onPress={() => setDatePickerVisible(true)}
              >
                <Text style={tw`text-gray-900`}>
                  {newDoc.expiryDate || "Select Expiry Date"}
                </Text>
                <Feather name="calendar" size={20} color="#374151" />
              </TouchableOpacity>
              <DateTimePickerModal
                isVisible={datePickerVisible}
                mode="date"
                onConfirm={handleDateConfirm}
                onCancel={() => setDatePickerVisible(false)}
                minimumDate={new Date()} // Prevent past dates
              />
              <TouchableOpacity
                style={tw`bg-gray-200 py-3 px-4 rounded-lg mb-4 flex-row items-center justify-between`}
                onPress={handlePickImage}
              >
                <Text style={tw`text-gray-700`}>
                  {newDoc.file ? "Image Selected" : "Take Photo"}
                </Text>
                <Feather name="camera" size={20} color="#374151" />
              </TouchableOpacity>
              <View style={tw`flex-row justify-end `}>
                <TouchableOpacity
                  style={tw`bg-gray-600 py-2 px-8 rounded-lg mr-2`}
                  onPress={() => setModalVisible(false)}
                >
                  <Text style={tw`text-white font-medium text-lg`}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`bg-indigo-600 py-2 px-8 rounded-lg`}
                  onPress={handleSaveDocument}
                >
                  <Text style={tw`text-white font-medium text-lg`}>Save</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </SafeAreaView>
  );
}
