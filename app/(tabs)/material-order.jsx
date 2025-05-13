import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Switch,
} from "react-native";
import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";

export default function MaterialOrderScreen() {
  const router = useRouter();
  const [stage, setStage] = useState("selectProject");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [selectedPO, setSelectedPO] = useState(null);
  const [vendor, setVendor] = useState(null);
  const [vendorId, setVendorId] = useState(null);
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [shippingMethod, setShippingMethod] = useState("Delivery");
  const [isShippingDropdownOpen, setIsShippingDropdownOpen] = useState(false);
  const [deliveryInstructions, setDeliveryInstructions] = useState("");
  const [laborersRequired, setLaborersRequired] = useState(false);
  const [laborersQty, setLaborersQty] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedBidArea, setSelectedBidArea] = useState("All Areas");
  const [isBidAreaDropdownOpen, setIsBidAreaDropdownOpen] = useState(false);
  const [bidAreas, setBidAreas] = useState(["All Areas"]);

  const shippingOptions = ["Delivery", "Pickup"];

  const resetForm = () => {
    setSelectedPO(null);
    setVendor(null);
    setItems([]);
    setSelectedItems({});
    setSelectedVendor(null);
    setShippingMethod("Delivery");
    setDeliveryInstructions("");
    setLaborersRequired(false);
    setLaborersQty("");
    setSelectedBidArea("All Areas");
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const token = await SecureStore.getItemAsync("authToken");
        if (!token) throw new Error("No authentication token found");

        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();

        if (!response.ok) throw new Error("Failed to fetch projects");

        setProjects(data || []);
      } catch (error) {
        console.error("Error fetching projects:", error);
        Alert.alert("Error", "Failed to load projects.");
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const getAvailabilityColor = (required, ordered, pending) => {
    const total = required || 0;
    const used = (ordered || 0) + (pending || 0);
    const percentage = total > 0 ? (used / total) * 100 : 0;

    if (percentage >= 100) {
      return { color: "bg-red-500", textColor: "text-red-600", percentage };
    } else if (percentage >= 75) {
      return {
        color: "bg-yellow-500",
        textColor: "text-yellow-600",
        percentage,
      };
    } else {
      return { color: "bg-green-500", textColor: "text-green-600", percentage };
    }
  };

  useEffect(() => {
    if (!selectedProject) return;

    setPurchaseOrders(
      selectedProject.purchaseOrders.map((po) => ({
        _id: po._id,
        poNumber: po.poNumber,
        title: po.title || "Untitled PO",
        lineItems: po.lineItems || [],
      }))
    );
    setStage("modeSelection");
  }, [selectedProject]);

  useEffect(() => {
    if (!selectedProject || !selectedPO) {
      setItems([]);
      setVendor(null);
      setVendorId(null);
      setBidAreas(["All Areas"]);
      setSelectedBidArea("All Areas");
      return;
    }

    const po = purchaseOrders.find((po) => po._id === selectedPO);
    if (!po) return;

    // Extract unique bid areas
    const uniqueBidAreas = [
      "All Areas",
      ...new Set(po.lineItems.map((item) => item.bidArea).filter(Boolean)),
    ];
    setBidAreas(uniqueBidAreas);

    const filteredItems = po.lineItems
      .map((lineItem) => {
        const projectItem = selectedProject.projectItems.find(
          (pi) => pi._id.toString() === lineItem.projectItem?.toString()
        );

        return {
          _id: lineItem._id || lineItem.title,
          projectItemId: projectItem?._id,
          title: lineItem.title,
          description: lineItem.itemDescription || "",
          quantityRequired:
            lineItem.quantity ||
            (projectItem ? projectItem.quantityRequired : 0),
          quantityOrdered: projectItem ? projectItem.quantityOrdered : 0,
          quantityPending: projectItem ? projectItem.quantityPending : 0,
          vendor: lineItem.vendor.companyName,
          vendorId: lineItem.vendor,
          container: lineItem.container,
          size: lineItem.size,
          bidArea: lineItem.bidArea,
        };
      })
      .filter((item) => {
        // Apply bid area filter
        if (
          selectedBidArea !== "All Areas" &&
          item.bidArea !== selectedBidArea
        ) {
          return false;
        }
        const available =
          item.quantityRequired - item.quantityOrdered - item.quantityPending;
        return available > 0;
      });

    setItems(filteredItems);

    // Check for vendor conflicts with selected items
    if (selectedVendor && filteredItems.length > 0) {
      const hasVendorMismatch = filteredItems.some(
        (item) => item.vendor !== selectedVendor
      );
      if (hasVendorMismatch) {
        Alert.alert(
          "Vendor Mismatch",
          "Some items in this bid area are from a different vendor. You may need to create separate orders for items from different vendors."
        );
      }
    }
  }, [selectedProject, selectedPO, selectedBidArea]);

  const handleSelectProject = (project) => {
    setSelectedProject(project);
  };

  const handleSelectPO = (poId) => {
    setSelectedPO(poId);
    setSelectedItems({});
    setSelectedVendor(null);
    setSelectedBidArea("All Areas");
  };

  const handleItemQuantityChange = (itemId, value) => {
    const numValue = parseInt(value) || 0;
    const item = items.find((i) => i._id === itemId);
    const maxQty =
      item.quantityRequired - item.quantityOrdered - item.quantityPending;

    if (numValue > maxQty) {
      Alert.alert("Error", `Quantity cannot exceed ${maxQty}`);
      setSelectedItems((prev) => ({ ...prev, [itemId]: maxQty.toString() }));
      return;
    }

    const newSelectedItems = { ...selectedItems, [itemId]: value };

    if (!selectedVendor && numValue > 0) {
      setSelectedVendor(item.vendor);
      setVendorId(item.vendorId);
    }

    if (numValue === 0 || value === "") {
      delete newSelectedItems[itemId];
      const hasNonZero = Object.values(newSelectedItems).some(
        (qty) => parseInt(qty) > 0
      );
      if (!hasNonZero) {
        setSelectedVendor(null);
      }
    } else if (selectedVendor && item.vendor !== selectedVendor) {
      Alert.alert(
        "Vendor Mismatch",
        "All items must be from the same vendor. Create a separate order for items from different vendors."
      );
      return;
    }

    setSelectedItems(newSelectedItems);
  };

  const fetchNextMaterialOrderNumber = async (poNumber) => {
    const token = await SecureStore.getItemAsync("authToken");
    const response = await fetch(
      "https://erp-production-72da01c8e651.herokuapp.com/api/materialOrders/next-number",
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await response.json();
    return `${poNumber}-${data.nextNumber}`;
  };

  const handleSubmit = async () => {
    if (!selectedPO || Object.keys(selectedItems).length === 0) {
      Alert.alert("Error", "Please select a PO and enter item quantities.");
      return;
    }

    const po = purchaseOrders.find((p) => p._id === selectedPO);
    const itemsToOrder = Object.entries(selectedItems)
      .filter(([, qty]) => parseInt(qty) > 0)
      .map(([itemId, qty]) => {
        const item = po.lineItems.find((i) => (i._id || i.title) === itemId);
        const projectItem = selectedProject.projectItems.find(
          (pi) => pi._id.toString() === item.projectItem?.toString()
        );
        return {
          projectItem: projectItem?._id,
          quantity: parseInt(qty),
        };
      });

    if (itemsToOrder.length === 0) {
      Alert.alert("Error", "Please enter quantities greater than 0.");
      return;
    }

    if (laborersRequired && (!laborersQty || parseInt(laborersQty) <= 0)) {
      Alert.alert("Error", "Please enter a valid number of laborers.");
      return;
    }

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const materialOrderNumber = await fetchNextMaterialOrderNumber(
        po.poNumber
      );

      const orderData = {
        project: selectedProject._id,
        purchaseOrder: selectedPO,
        vendor: vendorId,
        poNumber: po.poNumber,
        materialOrderNumber,
        items: JSON.stringify(itemsToOrder),
        shippingMethod,
        deliveryInstructions,
        laborersRequired,
        laborersQty: laborersRequired ? parseInt(laborersQty) : 0,
        status: "pending",
      };

      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/materialOrders/createMobile",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(orderData),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to create material order");
      }

      resetForm();
      setStage("modeSelection");
      Alert.alert("Success", "Material order created successfully.");
    } catch (error) {
      console.error("Error submitting order:", error);
      Alert.alert("Error", error.message || "Failed to create material order.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <Text style={tw`text-[20px] text-gray-900 mb-6`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50 p-6`}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {stage === "selectProject" && (
          <>
            <Text
              style={tw`text-[24px] font-bold text-gray-900 mb-6 text-center`}
            >
              Select Project
            </Text>
            {projects.length > 0 ? (
              projects.map((project) => (
                <TouchableOpacity
                  key={project._id}
                  style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
                  onPress={() => handleSelectProject(project)}
                >
                  <View
                    style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                  >
                    <FontAwesome name="building" size={24} color="gray" />
                  </View>
                  <Text style={tw`text-[16px] text-gray-900 flex-1`}>
                    {project.projectName}
                  </Text>
                </TouchableOpacity>
              ))
            ) : (
              <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                No projects available
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
                Exit
              </Text>
            </TouchableOpacity>
          </>
        )}

        {stage === "modeSelection" && (
          <>
            <Text
              style={tw`text-[24px] font-bold text-gray-900 mb-6 text-center`}
            >
              Material Order Management - {selectedProject.projectName}
            </Text>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-gray-200 shadow-md`}
              onPress={() => setStage("create")}
            >
              <LinearGradient
                colors={["#4f46e5", "#7c3aed"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="plus" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Create New Order
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-gray-200 shadow-md`}
              onPress={() =>
                router.push({
                  pathname: "/material-order-history",
                  params: { projectId: selectedProject._id },
                })
              }
            >
              <LinearGradient
                colors={["#10b981", "#34d399"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="history" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Order History
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
              onPress={() => {
                setSelectedProject(null);
                setStage("selectProject");
              }}
            >
              <LinearGradient
                colors={["#6b7280", "#9ca3af"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Back to Project Selection
              </Text>
            </TouchableOpacity>
          </>
        )}

        {stage === "create" && (
          <>
            {!selectedPO ? (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Purchase Order
                </Text>
                {purchaseOrders.length > 0 ? (
                  purchaseOrders.map((po) => (
                    <TouchableOpacity
                      key={po._id}
                      style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
                      onPress={() => handleSelectPO(po._id)}
                    >
                      <View
                        style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                      >
                        <FontAwesome name="file-text" size={24} color="gray" />
                      </View>
                      <Text style={tw`text-[16px] text-gray-900 flex-1`}>
                        {po.title} (PO# {po.poNumber})
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                    No purchase orders available
                  </Text>
                )}
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("modeSelection")}
                >
                  <LinearGradient
                    colors={["#6b7280", "#9ca3af"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="arrow-left" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Go Back
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text
                  style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
                >
                  Order Materials for PO#{" "}
                  {purchaseOrders.find((po) => po._id === selectedPO)?.poNumber}
                </Text>

                {/* Bid Area Dropdown */}
                <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}>
                  <Text
                    style={tw`text-[16px] font-semibold text-gray-900 mb-2`}
                  >
                    Select Bid Area
                  </Text>
                  <TouchableOpacity
                    style={tw`bg-gray-100 p-3 rounded-lg flex-row justify-between items-center border border-gray-300`}
                    onPress={() => setIsBidAreaDropdownOpen((prev) => !prev)}
                  >
                    <Text style={tw`text-[16px] text-gray-900`}>
                      {selectedBidArea}
                    </Text>
                    <FontAwesome
                      name={
                        isBidAreaDropdownOpen ? "chevron-up" : "chevron-down"
                      }
                      size={16}
                      color="#999"
                    />
                  </TouchableOpacity>
                  {isBidAreaDropdownOpen && (
                    <View
                      style={tw`bg-white border border-gray-300 rounded-lg mt-1 shadow-md`}
                    >
                      {bidAreas.map((area) => (
                        <TouchableOpacity
                          key={area}
                          style={tw`p-3`}
                          onPress={() => {
                            setSelectedBidArea(area);
                            setIsBidAreaDropdownOpen(false);
                          }}
                        >
                          <Text style={tw`text-[16px] text-gray-900`}>
                            {area}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>

                {items
                  .filter((item) =>
                    selectedVendor ? item.vendor === selectedVendor : true
                  )
                  .map((item) => {
                    const remainingQty =
                      item.quantityRequired -
                      item.quantityOrdered -
                      item.quantityPending;
                    const { color, textColor, percentage } =
                      getAvailabilityColor(
                        item.quantityRequired,
                        item.quantityOrdered,
                        item.quantityPending
                      );
                    return (
                      <View
                        key={item._id}
                        style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                      >
                        <Text
                          style={tw`text-[16px] text-gray-900 font-medium mb-2`}
                        >
                          {item.title}
                        </Text>
                        <View style={tw`flex-row justify-between mb-1`}>
                          <Text style={tw`text-[14px] text-gray-600`}>
                            Req: {item.quantityRequired.toLocaleString()}
                          </Text>
                          <Text style={tw`text-[14px] text-gray-600`}>
                            Ord: {item.quantityOrdered.toLocaleString()}
                          </Text>
                        </View>
                        <View style={tw`flex-row justify-between mb-1`}>
                          <Text style={tw`text-[14px] text-gray-600`}>
                            Pend: {item.quantityPending.toLocaleString()}
                          </Text>
                          <Text style={tw`${textColor} text-[14px]`}>
                            Avail: {remainingQty.toLocaleString()} (
                            {percentage.toFixed(1)}%)
                          </Text>
                        </View>
                        <View
                          style={tw`w-full bg-gray-200 rounded-full h-2 mb-3`}
                        >
                          <View
                            style={tw`w-[${percentage}%] ${color} h-2 rounded-full`}
                          />
                        </View>
                        <View style={tw`flex-row items-center mb-3`}>
                          <TextInput
                            style={tw`bg-gray-100 text-gray-900 p-3 rounded-lg w-24 text-[16px] border border-gray-300`}
                            keyboardType="numeric"
                            value={selectedItems[item._id] || ""}
                            onChangeText={(value) =>
                              handleItemQuantityChange(item._id, value)
                            }
                            placeholder="Qty"
                            placeholderTextColor="#999"
                          />
                          <Text style={tw`text-[14px] text-gray-600 ml-3`}>
                            {item.size} {item.container}
                          </Text>
                        </View>
                        <Text style={tw`text-[14px] text-gray-600`}>
                          Vendor: {item.vendor}
                        </Text>
                        <Text style={tw`text-[14px] text-gray-600 mt-1`}>
                          Bid Area: {item.bidArea}
                        </Text>
                        {item.description && (
                          <Text style={tw`text-[14px] text-gray-600 mt-1`}>
                            Desc: {item.description}
                          </Text>
                        )}
                      </View>
                    );
                  })}

                <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}>
                  <Text
                    style={tw`text-[16px] font-semibold text-gray-900 mb-2`}
                  >
                    Shipping Method
                  </Text>
                  <TouchableOpacity
                    style={tw`bg-gray-100 p-3 rounded-lg flex-row justify-between items-center border border-gray-300`}
                    onPress={() => setIsShippingDropdownOpen((prev) => !prev)}
                  >
                    <Text style={tw`text-[16px] text-gray-900`}>
                      {shippingMethod}
                    </Text>
                    <FontAwesome
                      name={
                        isShippingDropdownOpen ? "chevron-up" : "chevron-down"
                      }
                      size={16}
                      color="#999"
                    />
                  </TouchableOpacity>
                  {isShippingDropdownOpen && (
                    <View
                      style={tw`bg-white border border-gray-300 rounded-lg mt-1 shadow-md`}
                    >
                      {shippingOptions.map((option) => (
                        <TouchableOpacity
                          key={option}
                          style={tw`p-3`}
                          onPress={() => {
                            setShippingMethod(option);
                            setIsShippingDropdownOpen(false);
                          }}
                        >
                          <Text style={tw`text-[16px] text-gray-900`}>
                            {option}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                  <Text
                    style={tw`text-[16px] font-semibold text-gray-900 mt-4 mb-2`}
                  >
                    Delivery Instructions
                  </Text>
                  <TextInput
                    style={tw`bg-gray-100 text-gray-900 p-3 rounded-lg border border-gray-300`}
                    multiline
                    value={deliveryInstructions}
                    onChangeText={setDeliveryInstructions}
                    placeholder="Enter instructions"
                    placeholderTextColor="#999"
                  />
                  <View style={tw`flex-row items-center mt-4`}>
                    <Text
                      style={tw`text-[16px] font-semibold text-gray-900 mr-4`}
                    >
                      Laborers Required
                    </Text>
                    <Switch
                      value={laborersRequired}
                      onValueChange={setLaborersRequired}
                      trackColor={{ false: "#767577", true: "#10b981" }}
                      thumbColor={laborersRequired ? "#fff" : "#f4f3f4"}
                    />
                    {laborersRequired && (
                      <TextInput
                        style={tw`bg-gray-100 text-gray-900 p-3 rounded-lg w-32 text-[16px] border border-gray-300 ml-4`}
                        keyboardType="numeric"
                        value={laborersQty}
                        onChangeText={setLaborersQty}
                        placeholder="#of laborers"
                        placeholderTextColor="#999"
                      />
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                  onPress={handleSubmit}
                >
                  <LinearGradient
                    colors={["#10b981", "#34d399"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="paper-plane" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Create Material Order
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setSelectedPO(null)}
                >
                  <LinearGradient
                    colors={["#6b7280", "#9ca3af"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="arrow-left" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Go Back
                  </Text>
                </TouchableOpacity>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
