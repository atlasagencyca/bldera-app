import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
  Modal,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome, MaterialIcons } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system";
import { CameraView, useCameraPermissions } from "expo-camera";

export const options = {
  title: "Material Order History",
};

export default function MaterialOrderHistory() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [project, setProject] = useState(null);
  const [materialOrders, setMaterialOrders] = useState([]);
  const [filteredOrders, setFilteredOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [historyTab, setHistoryTab] = useState("confirmed");
  const [editedItems, setEditedItems] = useState([]);
  const [shippingMethod, setShippingMethod] = useState("");
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [laborersRequired, setLaborersRequired] = useState(false);
  const [laborersQty, setLaborersQty] = useState("");
  const [isShippingDropdownOpen, setIsShippingDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState("back");
  const shippingOptions = ["Delivery", "Pickup"];

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const token = await SecureStore.getItemAsync("authToken");
        if (!token) throw new Error("No authentication token found");

        const projectsResponse = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!projectsResponse.ok) throw new Error("Failed to fetch projects");
        const projects = await projectsResponse.json();

        const selectedProject = projects.find((p) => p._id === projectId);
        if (!selectedProject) throw new Error("Project not found");

        const materialOrdersResponse = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/materialOrders/project/${selectedProject._id}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (!materialOrdersResponse.ok)
          throw new Error("Failed to fetch material orders");
        const materialOrdersData = await materialOrdersResponse.json();

        setProject(selectedProject);
        setMaterialOrders(materialOrdersData);
      } catch (error) {
        console.error("Error fetching project:", error);
        Alert.alert("Error", "Failed to load project details.");
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  useEffect(() => {
    if (!materialOrders || materialOrders.length === 0) {
      setFilteredOrders([]);
      return;
    }

    const statusMap = {
      confirmed: "confirmed",
      delivered: "delivered",
    };

    const filtered = materialOrders.filter((order) => {
      return order.status === statusMap[historyTab];
    });

    setFilteredOrders(filtered);
  }, [historyTab, materialOrders]);

  const handleSelectOrder = (order) => {
    console.log("Selecting order:", order);
    console.log("Laborers Qty from order:", order.laborersQty);
    setSelectedOrder(order);
    setEditedItems([...order.items]);
    setShippingMethod(order.shippingMethod || "Delivery");
    setDeliveryInstructions(order.deliveryInstructions || "");
    setLaborersRequired(order.laborersRequired || false);
    setLaborersQty(order.laborersQty ? order.laborersQty.toString() : "0");
  };

  const handleItemQuantityChange = (itemId, value, originalQuantity) => {
    const numValue = parseInt(value) || 0;
    setEditedItems((prev) =>
      prev.map((item) => {
        if (item.projectItem._id === itemId) {
          const required = item.projectItem.quantityRequired;
          const ordered = item.projectItem.quantityOrdered;
          const pending = item.projectItem.quantityPending;

          const pendingExcludingThisOrder = pending - (originalQuantity || 0);
          const remainingCapacity =
            required - (ordered + pendingExcludingThisOrder);

          const newQuantity = Math.max(
            0,
            Math.min(numValue, remainingCapacity)
          );

          if (numValue > remainingCapacity) {
            Alert.alert(
              "Warning",
              `Quantity cannot exceed remaining capacity of ${remainingCapacity} for ${item.projectItem.title}`
            );
          }

          return { ...item, quantity: newQuantity };
        }
        return item;
      })
    );
  };

  const handleSaveChanges = async () => {
    try {
      setLoading(true);
      for (const item of editedItems) {
        const required = item.projectItem.quantityRequired;
        const ordered = item.projectItem.quantityOrdered;
        const pending = item.projectItem.quantityPending;
        const originalQuantity =
          selectedOrder.items.find(
            (i) => i.projectItem._id === item.projectItem._id
          ).quantity || 0;
        const pendingExcludingThisOrder = pending - originalQuantity;
        const newTotal =
          ordered + pendingExcludingThisOrder + (item.quantity || 0);

        if (newTotal > required) {
          throw new Error(
            `Total quantity (${newTotal}) for ${item.projectItem.title} exceeds required amount (${required})`
          );
        }
        if ((item.quantity || 0) < 0) {
          throw new Error(
            `Quantity for ${item.projectItem.title} cannot be negative`
          );
        }
      }

      console.log(selectedOrder);

      const token = await SecureStore.getItemAsync("authToken");
      const updatedOrder = {
        items: editedItems.map((item) => ({
          ...item,
          quantity: item.quantity || 0,
        })),
        shippingMethod,
        deliveryInstructions,
        laborersRequired,
        laborersQty: laborersRequired ? parseInt(laborersQty) || 0 : 0,
      };

      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/materialOrders/update/${selectedOrder._id}`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updatedOrder),
        }
      );

      console.log(response);

      if (!response.ok) {
        const errorData = await response.json(); // Get the error message from the response
        console.error("Server error response:", errorData);
        throw new Error(errorData.message || "Failed to update order");
      }
      const updatedData = await response.json();

      setMaterialOrders((prev) =>
        prev.map((o) =>
          o._id === selectedOrder._id ? { ...o, ...updatedData } : o
        )
      );
      setSelectedOrder(null);
      Alert.alert("Success", "Order updated successfully.");
    } catch (error) {
      console.error("Error saving changes:", error);
      Alert.alert("Error", error.message || "Failed to save changes.");
    } finally {
      setLoading(false);
    }
  };

  const handleMarkDelivered = async (orderId) => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/materialOrders/${orderId}/delivered`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: "delivered" }),
        }
      );

      if (!response.ok) throw new Error("Failed to update order");

      Alert.alert("Success", "Order marked as delivered.");

      router.push({
        pathname: "/material-order",
      });
    } catch (error) {
      console.error("Error marking delivered:", error);
      Alert.alert("Error", "Failed to mark as delivered.");
    } finally {
      setLoading(false);
    }
  };

  const uploadDeliveryImages = async (materialOrderId, imagesArray) => {
    if (imagesArray.length === 0) {
      Alert.alert("Info", "No images selected to upload.");
      return;
    }

    try {
      setUploading(true);
      const token = await SecureStore.getItemAsync("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const formData = new FormData();
      for (const [index, image] of imagesArray.entries()) {
        const fileInfo = await FileSystem.getInfoAsync(image.uri);
        if (!fileInfo.exists) {
          throw new Error(`File at ${image.uri} does not exist`);
        }

        formData.append("deliveryAttachments", {
          uri: image.uri,
          name: `delivery_${index}.jpg`,
          type: "image/jpeg",
        });
      }

      const imageUploadResponse = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/materialOrders/${materialOrderId}/upload-delivery-images`,
        {
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      if (!imageUploadResponse.ok) {
        const errorText = await imageUploadResponse.text();
        throw new Error(`Image upload failed: ${errorText}`);
      }

      const updatedOrder = await imageUploadResponse.json();
      setMaterialOrders((prev) =>
        prev.map((o) =>
          o._id === materialOrderId ? { ...o, ...updatedOrder } : o
        )
      );
      if (selectedOrder && selectedOrder._id === materialOrderId) {
        setSelectedOrder(updatedOrder);
      }
      Alert.alert("Success", "Delivery images uploaded successfully.");
    } catch (error) {
      console.error("Error uploading delivery images:", error);
      Alert.alert(
        "Error",
        error.message || "Failed to upload delivery images."
      );
    } finally {
      setUploading(false);
    }
  };

  const handleCapturePhoto = async () => {
    if (!permission?.granted) {
      const { status } = await requestPermission();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Camera access is needed to take photos."
        );
        return;
      }
    }

    try {
      if (cameraRef.current) {
        const availableSizes =
          await cameraRef.current.getAvailablePictureSizesAsync();
        console.log("Available picture sizes:", availableSizes);

        const pictureSize =
          availableSizes.find((size) => {
            const [width, height] = size.split("x").map(Number);
            const aspectRatio = width / height;
            return Math.abs(aspectRatio - 4 / 3) < 0.05;
          }) || availableSizes[0];

        console.log("Selected picture size:", pictureSize);

        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: false,
          pictureSize,
        });

        const newPhoto = { uri: photo.uri };
        await uploadDeliveryImages(selectedOrder._id, [newPhoto]);
        setCameraModalVisible(false);
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      Alert.alert("Error", "Failed to capture photo.");
    }
  };

  const handleSelectFromLibrary = async () => {
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Gallery access is needed to select photos."
        );
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 1,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const newImages = result.assets.map((asset) => ({ uri: asset.uri }));
        await uploadDeliveryImages(selectedOrder._id, newImages);
      }
      setCameraModalVisible(false);
    } catch (error) {
      console.error("Error selecting from gallery:", error);
      Alert.alert("Error", "Failed to select images from gallery.");
    }
  };

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const getRemainingCapacityColor = (capacity, required) => {
    const percentage = required ? (capacity / required) * 100 : 0;
    if (percentage > 50) return "text-green-600";
    if (percentage >= 20) return "text-yellow-600";
    return "text-red-600";
  };

  if (loading || !project) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <Text style={tw`text-[20px] text-gray-900 mb-6`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50 p-6`}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {!selectedOrder ? (
          <>
            <Text
              style={tw`text-[24px] font-bold text-gray-900 mb-6 text-center`}
            >
              Material Order History - {project.projectName}
            </Text>
            <View
              style={tw`flex-row mb-4 bg-white rounded-full p-1 border border-gray-200 shadow-md`}
            >
              <TouchableOpacity
                style={tw`flex-1 rounded-full py-2 ${
                  historyTab === "confirmed" ? "bg-gray-100" : ""
                }`}
                onPress={() => setHistoryTab("confirmed")}
              >
                <Text
                  style={tw`text-[16px] text-gray-900 font-semibold text-center ${
                    historyTab === "confirmed" ? "text-indigo-600" : ""
                  }`}
                >
                  Confirmed
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-1 rounded-full py-2 ${
                  historyTab === "delivered" ? "bg-gray-100" : ""
                }`}
                onPress={() => setHistoryTab("delivered")}
              >
                <Text
                  style={tw`text-[16px] text-gray-900 font-semibold text-center ${
                    historyTab === "delivered" ? "text-indigo-600" : ""
                  }`}
                >
                  Delivered
                </Text>
              </TouchableOpacity>
            </View>
            {filteredOrders.length > 0 ? (
              filteredOrders.map((order) => (
                <TouchableOpacity
                  key={order._id}
                  style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
                  onPress={() => handleSelectOrder(order)}
                >
                  <View
                    style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                  >
                    <FontAwesome name="truck" size={24} color="gray" />
                  </View>
                  <View style={tw`flex-1`}>
                    <Text style={tw`text-[16px] text-gray-900 font-medium`}>
                      Order #{order.materialOrderNumber}
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      PO #{order.poNumber}
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      Vendor: {order.vendor?.companyName || "N/A"}
                    </Text>
                    <Text
                      style={tw`text-[14px] ${
                        order.status === "delivered"
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      Status:{" "}
                      {order.status.charAt(0).toUpperCase() +
                        order.status.slice(1)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                No {historyTab} orders
              </Text>
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
              onPress={() => router.back()}
            >
              <LinearGradient
                colors={["#6b7280", "#9ca3af"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Go Back
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text
              style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
            >
              Order #{selectedOrder.materialOrderNumber}
            </Text>
            {editedItems.map((item) => {
              const currentQuantity = item.quantity || 0;
              const originalQuantity =
                selectedOrder.items.find(
                  (i) => i.projectItem._id === item.projectItem._id
                )?.quantity || 0;
              const pendingExcludingThisOrder =
                item.projectItem.quantityPending - originalQuantity;
              const remainingCapacity =
                item.projectItem.quantityRequired -
                (item.projectItem.quantityOrdered + pendingExcludingThisOrder);

              return (
                <View
                  key={item.projectItem._id}
                  style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                >
                  <Text style={tw`text-[18px] text-gray-900 font-medium mb-2`}>
                    {item.projectItem.title} -{" "}
                    <Text style={tw`text-[16px] text-gray-600`}>
                      {item.bidArea || "(unassigned)"}
                    </Text>
                  </Text>
                  <Text style={tw`text-[14px] text-gray-600 mb-1`}>
                    Req: {item.projectItem.quantityRequired} | Ord:{" "}
                    {item.projectItem.quantityOrdered} | Pend:{" "}
                    {item.projectItem.quantityPending}
                  </Text>
                  <Text
                    style={tw`text-[16px] font-medium mb-2 ${getRemainingCapacityColor(
                      remainingCapacity,
                      item.projectItem.quantityRequired
                    )}`}
                  >
                    Remaining Capacity: {remainingCapacity}
                  </Text>
                  <View style={tw`flex-row items-center`}>
                    <Text
                      style={tw`text-[14px] text-gray-900 font-medium mr-2`}
                    >
                      Qty:
                    </Text>
                    {selectedOrder.status === "confirmed" ? (
                      <TextInput
                        style={tw`bg-white text-gray-900 p-3 rounded-lg w-24 text-[16px] border border-gray-300`}
                        value={currentQuantity.toString()}
                        keyboardType="numeric"
                        onChangeText={(value) =>
                          handleItemQuantityChange(
                            item.projectItem._id,
                            value,
                            originalQuantity
                          )
                        }
                      />
                    ) : (
                      <Text
                        style={tw`bg-gray-200 text-gray-500 p-3 rounded-lg w-24 text-[16px] border border-gray-300`}
                      >
                        {currentQuantity}
                      </Text>
                    )}
                  </View>
                </View>
              );
            })}
            <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}>
              <Text style={tw`text-[16px] font-semibold text-gray-900 mb-2`}>
                Shipping Method
              </Text>
              {selectedOrder.status === "confirmed" ? (
                <TouchableOpacity
                  style={tw`bg-white p-3 rounded-lg border border-gray-300`}
                  onPress={() =>
                    setIsShippingDropdownOpen(!isShippingDropdownOpen)
                  }
                >
                  <Text style={tw`text-gray-900`}>
                    {shippingMethod || "Select"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text
                  style={tw`bg-gray-200 text-gray-500 p-3 rounded-lg border border-gray-300`}
                >
                  {shippingMethod || "Not specified"}
                </Text>
              )}
              {isShippingDropdownOpen &&
                selectedOrder.status === "confirmed" && (
                  <View
                    style={tw`absolute mt-16 bg-white border border-gray-300 rounded-lg shadow-md z-10`}
                  >
                    {shippingOptions.map((option) => (
                      <TouchableOpacity
                        key={option}
                        style={tw`p-2`}
                        onPress={() => {
                          setShippingMethod(option);
                          setIsShippingDropdownOpen(false);
                        }}
                      >
                        <Text style={tw`text-gray-900`}>{option}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              <Text
                style={tw`text-[16px] font-semibold text-gray-900 mt-4 mb-2`}
              >
                Delivery Instructions
              </Text>
              {selectedOrder.status === "confirmed" ? (
                <TextInput
                  style={tw`bg-white text-gray-900 p-3 rounded-lg border border-gray-300`}
                  value={deliveryInstructions}
                  onChangeText={setDeliveryInstructions}
                  multiline
                />
              ) : (
                <Text
                  style={tw`bg-gray-200 text-gray-500 p-3 rounded-lg border border-gray-300`}
                >
                  {deliveryInstructions || "None"}
                </Text>
              )}
              <View style={tw`flex-row items-center mt-4`}>
                <Text style={tw`text-[16px] font-semibold text-gray-900 mr-4`}>
                  Laborers Required:
                </Text>
                {selectedOrder.status === "confirmed" ? (
                  <>
                    <Switch
                      value={laborersRequired}
                      onValueChange={setLaborersRequired}
                      trackColor={{ false: "#d1d5db", true: "#10b981" }}
                      thumbColor={laborersRequired ? "#ffffff" : "#f3f4f6"}
                    />
                    {laborersRequired && (
                      <TextInput
                        style={tw`bg-white text-gray-900 p-2 rounded-lg w-16 ml-4 border border-gray-300`}
                        value={laborersQty}
                        keyboardType="numeric"
                        onChangeText={setLaborersQty}
                      />
                    )}
                  </>
                ) : (
                  <Text style={tw`text-[16px] text-gray-500`}>
                    {laborersRequired ? `Yes (${laborersQty || 0})` : "No"}
                  </Text>
                )}
              </View>
            </View>
            {selectedOrder.status === "confirmed" && (
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-blue-500 shadow-md`}
                onPress={handleSaveChanges}
                disabled={loading}
              >
                <LinearGradient
                  colors={["#3b82f6", "#60a5fa"]}
                  style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                >
                  <FontAwesome name="save" size={20} color="white" />
                </LinearGradient>
                <Text
                  style={tw`text-[18px] text-blue-600 font-semibold flex-1`}
                >
                  {loading ? "Saving..." : "Save Changes"}
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-purple-500 shadow-md`}
              onPress={() => setCameraModalVisible(true)}
              disabled={uploading || !selectedOrder}
            >
              <LinearGradient
                colors={["#9333ea", "#c084fc"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="camera" size={20} color="white" />
              </LinearGradient>
              <Text
                style={tw`text-[18px] text-purple-600 font-semibold flex-1`}
              >
                {uploading ? "Uploading..." : "Upload Delivery Images"}
              </Text>
            </TouchableOpacity>
            {selectedOrder.status === "confirmed" && (
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-green-500 shadow-md`}
                onPress={() => handleMarkDelivered(selectedOrder._id)}
              >
                <LinearGradient
                  colors={["#10b981", "#34d399"]}
                  style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                >
                  <FontAwesome name="check" size={20} color="white" />
                </LinearGradient>
                <Text
                  style={tw`text-[18px] text-green-600 font-semibold flex-1`}
                >
                  Mark Delivered
                </Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
              onPress={() => setSelectedOrder(null)}
            >
              <LinearGradient
                colors={["#6b7280", "#9ca3af"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Back to History
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {/* Camera Modal */}
      <Modal visible={cameraModalVisible} transparent animationType="slide">
        <View style={tw`flex-1 bg-black`}>
          {!permission?.granted ? (
            <View style={tw`flex-1 justify-center items-center px-5`}>
              <Text style={tw`text-white text-[18px] text-center mb-4`}>
                We need your permission to access the camera
              </Text>
              <TouchableOpacity
                onPress={requestPermission}
                style={tw`bg-[#162435] py-2 px-4 rounded-xl`}
              >
                <Text style={tw`text-white text-[16px]`}>Grant Permission</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setCameraModalVisible(false)}
                style={tw`bg-gray-500 py-2 px-4 rounded-xl mt-2`}
              >
                <Text style={tw`text-white text-[16px]`}>Close</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <CameraView style={tw`flex-1`} ref={cameraRef} facing={facing}>
              <View
                style={tw`absolute top-12 left-5 right-5 flex-row justify-between mt-2`}
              >
                <TouchableOpacity
                  onPress={() => setCameraModalVisible(false)}
                  style={tw`p-2 bg-gray-900 rounded-full`}
                >
                  <MaterialIcons name="close" size={28} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={toggleCameraFacing}
                  style={tw`p-2 bg-gray-900 rounded-full`}
                >
                  <MaterialIcons
                    name="flip-camera-ios"
                    size={28}
                    color="white"
                  />
                </TouchableOpacity>
              </View>
              <View
                style={tw`absolute bottom-12 left-5 right-5 flex-row justify-between items-center`}
              >
                <TouchableOpacity
                  onPress={handleSelectFromLibrary}
                  style={tw`p-2 bg-gray-900 rounded-full`}
                >
                  <MaterialIcons name="collections" size={28} color="white" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCapturePhoto}
                  style={tw`w-16 h-16 bg-white rounded-full flex items-center justify-center`}
                >
                  <MaterialIcons name="camera-alt" size={32} color="black" />
                </TouchableOpacity>
              </View>
            </CameraView>
          )}
        </View>
      </Modal>
    </View>
  );
}
