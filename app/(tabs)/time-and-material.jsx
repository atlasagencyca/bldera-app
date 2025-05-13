import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  TouchableWithoutFeedback,
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { FontAwesome } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import Signature from "react-native-signature-canvas";
import { SelectList } from "react-native-dropdown-select-list";

export default function TimeAndMaterialScreen() {
  const router = useRouter();
  const scrollViewRef = useRef(null);
  const signatureRef = useRef(null);
  const [stage, setStage] = useState("selectProject");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [entries, setEntries] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [labourItems, setLabourItems] = useState([]);
  const [materialItems, setMaterialItems] = useState([]);
  const [scopeOfWork, setScopeOfWork] = useState("");
  const [images, setImages] = useState([]);
  const [signature, setSignature] = useState(null);
  const [approvedBy, setApprovedBy] = useState("");
  const [loading, setLoading] = useState(false);
  const [availableLabourItems, setAvailableLabourItems] = useState([]);
  const [availableMaterialItems, setAvailableMaterialItems] = useState([]);
  const [selectedLabourItem, setSelectedLabourItem] = useState("");
  const [selectedMaterialItem, setSelectedMaterialItem] = useState("");
  const [labourQty, setLabourQty] = useState("");
  const [materialQty, setMaterialQty] = useState("");
  const [labourBidArea, setLabourBidArea] = useState("");
  const [materialBidArea, setMaterialBidArea] = useState("");
  const [availableBidAreas, setAvailableBidAreas] = useState([]);
  const [showLabourInput, setShowLabourInput] = useState(false);
  const [showMaterialInput, setShowMaterialInput] = useState(false);
  const [isSigning, setIsSigning] = useState(false);

  const signatureStyle = `
    .m-signature-pad {
      box-shadow: none;
      border-radius: 12px;
      border: 1px solid #d1d5db;
    }
    .m-signature-pad--body {
      background-color: #f9fafb;
    }
  `;

  const dropdownStyles = {
    boxStyles: tw`bg-gray-100 border border-gray-300 rounded-lg mb-3 h-12`,
    inputStyles: tw`text-gray-900 text-[18px]`,
    dropdownStyles: tw`bg-white border border-gray-300 rounded-lg shadow-md`,
    dropdownItemStyles: (index) =>
      tw`p-3 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"} text-[18px]`,
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
        Alert.alert("Error", "Failed to load projects.");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchEntries();
      fetchAvailableItems();
      setStage("modeSelection");
    }
  }, [selectedProject]);

  const fetchEntries = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/time-and-material/${selectedProject._id}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error("Failed to fetch entries");
      setEntries(data || []);
    } catch (error) {
      Alert.alert("Error", "Failed to load entries.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableItems = () => {
    const bidAreaSet = new Set();

    // Labour items from contractLabourItems
    const labourOptions = selectedProject.contractLabourItems.map((item) => ({
      key: item._id,
      value: `${item.labourItem?.title || "Unnamed"} (${item.uom})`,
      unitRate: item.unitRate,
      unitCost: item.unitCost || item.unitRate,
      uom: item.uom,
      costCode: item.costCode?._id || item.costCode || null,
      vendor: item.vendor?._id || item.vendor || null,
    }));

    // Material and additional labour items from budgets
    const materialOptions = [];
    selectedProject.budgets.forEach((budget) => {
      budget.lineItems.forEach((item) => {
        if (item.bidArea && item.bidArea !== "(unassigned)") {
          bidAreaSet.add(item.bidArea);
        }
        if (item.category === "M") {
          materialOptions.push({
            key: item._id,
            value: `${item.itemDescription || "Unnamed"} (${
              item.container || "N/A"
            } - ${item.size || "N/A"})`,
            cost: item.cost,
            price: item.price || item.cost,
            uom: item.container || "N/A",
            itemDescription: item.itemDescription || "Unnamed",
            itemCode: item.itemCode || "N/A",
            size: item.size || "N/A",
            container: item.container || "N/A",
            bidArea: item.bidArea || "",
            costCode: item.costCode?._id || item.costCode || null,
            vendor: item.vendor?._id || item.vendor || null,
          });
        } else if (item.category === "L") {
          labourOptions.push({
            key: item._id,
            value: `${item.costCodeDescription || "Unnamed"} (${item.uom})`,
            unitRate: item.unitRate || item.price,
            unitCost: item.unitCost || item.unitRate || item.price,
            uom: item.uom,
            bidArea: item.bidArea || "",
            costCode: item.costCode?._id || item.costCode || null,
            vendor: item.vendor?._id || item.vendor || null,
          });
        }
      });
    });

    setAvailableLabourItems(labourOptions);
    setAvailableMaterialItems(materialOptions);
    setAvailableBidAreas(
      Array.from(bidAreaSet).map((area) => ({
        key: area,
        value: area,
      }))
    );
  };

  const handleCreateToggle = () => {
    setIsCreating(!isCreating);
    setIsEditing(false);
    setEditingId(null);
    setLabourItems([]);
    setMaterialItems([]);
    setScopeOfWork("");
    setImages([]);
    setSignature(null);
    setApprovedBy("");
    setSelectedLabourItem("");
    setSelectedMaterialItem("");
    setLabourQty("");
    setMaterialQty("");
    setLabourBidArea("");
    setMaterialBidArea("");
    setShowLabourInput(false);
    setShowMaterialInput(false);
    setIsSigning(false);
  };

  const handleEdit = (entry) => {
    setIsEditing(true);
    setIsCreating(true);
    setEditingId(entry._id);
    try {
      setLabourItems(
        entry.labourItems.map((item) => ({
          contractLabourItem:
            item.contractLabourItem?.$oid ||
            item.contractLabourItem?._id ||
            item.contractLabourItem ||
            "",
          quantityUsed: item.quantityUsed || 0,
          totalCost: item.totalCost || 0,
          totalPrice: item.totalPrice || item.totalCost || 0,
          bidArea: item.bidArea || "",
          costCode:
            item.costCode?.$oid || item.costCode?._id || item.costCode || "",
          vendor: item.vendor?.$oid || item.vendor?._id || item.vendor || null,
        }))
      );
      setMaterialItems(
        entry.materialItems.map((item) => ({
          budgetLineItem:
            item.budgetLineItem?.$oid ||
            item.budgetLineItem?._id ||
            item.budgetLineItem ||
            "",
          quantityUsed: item.quantityUsed || 0,
          totalCost: item.totalCost || 0,
          totalPrice: item.totalPrice || item.totalCost || 0,
          cost: item.cost || 0,
          price: item.price || item.cost || 0,
          itemDescription: item.itemDescription || "Unnamed",
          itemCode: item.itemCode || "N/A",
          size: item.size || "N/A",
          container: item.container || "N/A",
          bidArea: item.bidArea || "",
          costCode:
            item.costCode?.$oid || item.costCode?._id || item.costCode || "",
          vendor: item.vendor?.$oid || item.vendor?._id || item.vendor || null,
        }))
      );
      setScopeOfWork(entry.scopeOfWork || "");
      setImages(entry.images || []);
      setSignature(entry.signature || null);
      setApprovedBy(entry.signedBy || "");
      setShowLabourInput(false);
      setShowMaterialInput(false);
      setIsSigning(false);
    } catch (error) {
      Alert.alert("Error", "Failed to load entry for editing.");
      console.error("Error in handleEdit:", error);
    }
  };

  const addLabourItem = () => {
    if (!selectedLabourItem || !labourQty || !labourBidArea) {
      Alert.alert(
        "Error",
        "Please select a labour item, quantity, and bid area."
      );
      return;
    }
    const labourItem = availableLabourItems.find(
      (item) => item.key === selectedLabourItem
    );
    if (!labourItem.costCode) {
      Alert.alert("Error", "Selected labour item is missing a cost code.");
      return;
    }
    const newLabourItem = {
      contractLabourItem: labourItem.key,
      quantityUsed: parseFloat(labourQty) || 0,
      totalCost: (parseFloat(labourQty) || 0) * labourItem.unitCost,
      totalPrice: (parseFloat(labourQty) || 0) * labourItem.unitRate,
      bidArea: labourBidArea,
      costCode: labourItem.costCode,
      vendor: labourItem.vendor,
    };
    setLabourItems((prev) => [...prev, newLabourItem]);
    setSelectedLabourItem("");
    setLabourQty("");
    setLabourBidArea("");
    setShowLabourInput(false);
  };

  const addMaterialItem = () => {
    if (!selectedMaterialItem || !materialQty || !materialBidArea) {
      Alert.alert(
        "Error",
        "Please select a material item, quantity, and bid area."
      );
      return;
    }
    const materialItem = availableMaterialItems.find(
      (item) => item.key === selectedMaterialItem
    );
    if (!materialItem.costCode) {
      Alert.alert("Error", "Selected material item is missing a cost code.");
      return;
    }
    const newMaterialItem = {
      budgetLineItem: materialItem.key,
      quantityUsed: parseFloat(materialQty) || 0,
      totalCost: (parseFloat(materialQty) || 0) * materialItem.cost,
      totalPrice: (parseFloat(materialQty) || 0) * materialItem.price,
      cost: materialItem.cost,
      price: materialItem.price,
      itemDescription: materialItem.itemDescription,
      itemCode: materialItem.itemCode,
      size: materialItem.size,
      container: materialItem.container,
      bidArea: materialBidArea,
      costCode: materialItem.costCode,
      vendor: materialItem.vendor, // Set default vendor from selected material item
    };
    setMaterialItems((prev) => [...prev, newMaterialItem]);
    setSelectedMaterialItem("");
    setMaterialQty("");
    setMaterialBidArea("");
    setShowMaterialInput(false);
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
    });

    if (!result.canceled) {
      setImages((prev) => [
        ...prev,
        ...result.assets.map((asset) => asset.uri),
      ]);
    }
  };

  const handleSubmit = async () => {
    if (labourItems.length === 0 && materialItems.length === 0) {
      Alert.alert("Error", "Please add at least one labour or material item.");
      return;
    }
    if (!approvedBy.trim()) {
      Alert.alert("Error", "Please provide an 'Approved by' name.");
      return;
    }

    try {
      setLoading(true);

      let signatureData = signature;
      if (!isEditing && signatureRef.current) {
        signatureData = signatureRef.current.getData();
        if (!signatureData) {
          signatureRef.current.readSignature();
          signatureData = signature;
        }
      }

      if (!signatureData || signatureData.trim() === "") {
        Alert.alert("Error", "Please provide a signature.");
        return;
      }

      const token = await SecureStore.getItemAsync("authToken");
      const formData = new FormData();
      formData.append("labourItems", JSON.stringify(labourItems));
      formData.append("materialItems", JSON.stringify(materialItems));
      formData.append("scopeOfWork", scopeOfWork);
      formData.append("signedBy", approvedBy);

      if (!isEditing) {
        formData.append("signature", {
          uri: signatureData,
          type: "image/png",
          name: "signature.png",
        });
      }

      images.forEach((image, index) => {
        if (image.startsWith("file://")) {
          formData.append("images", {
            uri: image,
            type: "image/jpeg",
            name: `image_${index}.jpg`,
          });
        }
      });

      const url = isEditing
        ? `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/time-and-material/${selectedProject._id}/${editingId}`
        : `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/time-and-material/signed/${selectedProject._id}`;

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
        const errorText = await response.text();
        throw new Error(`Failed to save entry: ${errorText}`);
      }

      const data = await response.json();

      if (isEditing) {
        setEntries((prev) =>
          prev.map((item) => (item._id === editingId ? data : item))
        );
      } else {
        setEntries((prev) => [...prev, data]);
      }

      handleCreateToggle();
      Alert.alert(
        "Success",
        `Entry ${isEditing ? "updated" : "created"} successfully`
      );
    } catch (error) {
      Alert.alert("Error", `Failed to save entry: ${error.message}`);
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignatureStart = () => {
    setIsSigning(true);
  };

  const handleSignatureEnd = () => {
    setIsSigning(false);
  };

  const handleSignatureCaptured = (sig) => {
    setSignature(sig);
    setIsSigning(false);
  };

  const handleOutsideTap = () => {
    if (isSigning) {
      setIsSigning(false);
    }
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <Text style={tw`text-[24px] text-gray-900 mb-6`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50 p-6`}>
      <TouchableWithoutFeedback onPress={handleOutsideTap}>
        <ScrollView
          ref={scrollViewRef}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          scrollEnabled={!isSigning}
        >
          {stage === "selectProject" && (
            <>
              <Text
                style={tw`text-[28px] font-bold text-gray-900 mb-8 text-center`}
              >
                Select Project
              </Text>
              {projects.length === 0 ? (
                <Text style={tw`text-[18px] text-gray-500 text-center`}>
                  No projects available
                </Text>
              ) : (
                projects.map((project) => (
                  <TouchableOpacity
                    key={project._id}
                    style={tw`bg-white rounded-lg p-5 mb-5 shadow-md flex-row items-center`}
                    onPress={() => setSelectedProject(project)}
                  >
                    <View
                      style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                    >
                      <FontAwesome name="building" size={24} color="gray" />
                    </View>
                    <Text style={tw`text-[18px] text-gray-900 flex-1`}>
                      {project.projectName}
                    </Text>
                  </TouchableOpacity>
                ))
              )}
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 mt-6 border border-gray-200 shadow-md`}
                onPress={() => router.back()}
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
                  Exit
                </Text>
              </TouchableOpacity>
            </>
          )}

          {stage === "modeSelection" && !isCreating && (
            <>
              <Text
                style={tw`text-[28px] font-bold text-gray-900 mb-8 text-center`}
              >
                T&M - {selectedProject.projectName}
              </Text>
              <TouchableOpacity
                style={tw`flex-row items-center bg-indigo-600 rounded-full p-4 mb-8 shadow-md`}
                onPress={handleCreateToggle}
              >
                <LinearGradient
                  colors={["#4f46e5", "#7c3aed"]}
                  style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                >
                  <FontAwesome name="plus" size={20} color="white" />
                </LinearGradient>
                <Text style={tw`text-[18px] text-white font-semibold flex-1`}>
                  Create New Entry
                </Text>
              </TouchableOpacity>
              {entries.length === 0 ? (
                <Text style={tw`text-[18px] text-gray-500 text-center mb-6`}>
                  No entries available
                </Text>
              ) : (
                entries.map((entry) => (
                  <View
                    key={entry._id}
                    style={tw`bg-white rounded-lg p-5 mb-5 shadow-md`}
                  >
                    <Text
                      style={tw`text-[18px] text-gray-900 font-semibold mb-2`}
                    >
                      Created by: {entry.createdBy?.displayName || "Unknown"}
                    </Text>
                    <Text style={tw`text-[16px] text-gray-700`}>
                      Labour: {entry.labourItems.length} items
                    </Text>
                    {entry.labourItems.map((item, index) => (
                      <Text
                        key={`labour-${index}`}
                        style={tw`text-[14px] text-gray-600 ml-4`}
                      >
                        - {item.quantityUsed} {item.uom || "N/A"} (Bid Area:{" "}
                        {item.bidArea || "N/A"})
                      </Text>
                    ))}
                    <Text style={tw`text-[16px] text-gray-700`}>
                      Materials: {entry.materialItems.length} items
                    </Text>
                    {entry.materialItems.map((item, index) => (
                      <Text
                        key={`material-${index}`}
                        style={tw`text-[14px] text-gray-600 ml-4`}
                      >
                        - {item.quantityUsed} {item.container || "N/A"} (Bid
                        Area: {item.bidArea || "N/A"})
                      </Text>
                    ))}
                    <Text style={tw`text-[16px] text-gray-700 mt-1`}>
                      Scope: {entry.scopeOfWork || "N/A"}
                    </Text>
                    <Text style={tw`text-[16px] text-gray-700 mt-1`}>
                      Approved by: {entry.signedBy || "N/A"}
                    </Text>
                    {entry.signature && (
                      <Image
                        source={{ uri: entry.signature }}
                        style={tw`w-32 h-16 mt-2`}
                      />
                    )}
                    <TouchableOpacity
                      style={tw`mt-3`}
                      onPress={() => handleEdit(entry)}
                    >
                      <Text style={tw`text-[16px] text-indigo-600 font-medium`}>
                        Edit
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 mt-6 border border-gray-200 shadow-md`}
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
                <Text
                  style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                >
                  Back to Projects
                </Text>
              </TouchableOpacity>
            </>
          )}

          {isCreating && (
            <>
              <Text
                style={tw`text-[24px] font-bold text-gray-900 mb-8 text-center`}
              >
                {isEditing ? "Edit T&M Entry" : "New T&M Entry"}
              </Text>

              {/* Summary Card */}
              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  Summary
                </Text>
                {labourItems.length === 0 && materialItems.length === 0 ? (
                  <Text style={tw`text-[16px] text-gray-500`}>
                    No items added yet
                  </Text>
                ) : (
                  <>
                    {labourItems.map((item, index) => {
                      const labourDetail = availableLabourItems.find(
                        (opt) => opt.key === item.contractLabourItem
                      );
                      return (
                        <Text
                          key={index}
                          style={tw`text-[16px] text-gray-700 mb-2`}
                        >
                          {labourDetail
                            ? `${labourDetail.value.split(" (")[0]}: ${
                                item.quantityUsed
                              } ${labourDetail.uom || "N/A"} (Bid Area: ${
                                item.bidArea || "N/A"
                              })`
                            : `Labour Item: ${
                                item.quantityUsed
                              } HRs (Bid Area: ${item.bidArea || "N/A"})`}
                        </Text>
                      );
                    })}
                    {materialItems.map((item, index) => {
                      const materialDetail = availableMaterialItems.find(
                        (opt) => opt.key === item.budgetLineItem
                      );
                      return (
                        <Text
                          key={index}
                          style={tw`text-[16px] text-gray-700 mb-2`}
                        >
                          {materialDetail
                            ? `${materialDetail.itemDescription}: ${
                                item.quantityUsed
                              } ${materialDetail.uom || "N/A"} (Bid Area: ${
                                item.bidArea || "N/A"
                              })`
                            : `Material Item: ${item.quantityUsed} (Bid Area: ${
                                item.bidArea || "N/A"
                              })`}
                        </Text>
                      );
                    })}
                  </>
                )}
              </View>

              {/* Add Labour Items */}
              <TouchableOpacity
                style={tw`bg-indigo-600 rounded-lg p-4 mb-4 shadow-md`}
                onPress={() => setShowLabourInput(!showLabourInput)}
              >
                <Text
                  style={tw`text-[18px] text-white font-semibold text-center`}
                >
                  Add Labour Items
                </Text>
              </TouchableOpacity>
              {showLabourInput && (
                <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                  <Text
                    style={tw`text-[18px] font-semibold text-gray-900 mb-3`}
                  >
                    Add Labour Item
                  </Text>
                  <SelectList
                    setSelected={setSelectedLabourItem}
                    data={availableLabourItems}
                    placeholder="Select Labour Item"
                    boxStyles={dropdownStyles.boxStyles}
                    inputStyles={dropdownStyles.inputStyles}
                    dropdownStyles={dropdownStyles.dropdownStyles}
                    dropdownItemStyles={(index) =>
                      dropdownStyles.dropdownItemStyles(index)
                    }
                  />
                  <TextInput
                    style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 mt-3 mb-3 text-[18px]`}
                    keyboardType="numeric"
                    value={labourQty}
                    onChangeText={setLabourQty}
                    placeholder="Quantity (HRs)"
                    placeholderTextColor="#999"
                  />
                  <SelectList
                    setSelected={setLabourBidArea}
                    data={availableBidAreas}
                    placeholder="Select Bid Area"
                    boxStyles={dropdownStyles.boxStyles}
                    inputStyles={dropdownStyles.inputStyles}
                    dropdownStyles={dropdownStyles.dropdownStyles}
                    dropdownItemStyles={(index) =>
                      dropdownStyles.dropdownItemStyles(index)
                    }
                  />
                  <TouchableOpacity
                    style={tw`bg-green-600 p-4 rounded-lg mt-3`}
                    onPress={addLabourItem}
                  >
                    <Text
                      style={tw`text-[18px] text-white text-center font-semibold`}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Add Material Items */}
              <TouchableOpacity
                style={tw`bg-indigo-600 rounded-lg p-4 mb-4 shadow-md`}
                onPress={() => setShowMaterialInput(!showMaterialInput)}
              >
                <Text
                  style={tw`text-[18px] text-white font-semibold text-center`}
                >
                  Add Material Items
                </Text>
              </TouchableOpacity>
              {showMaterialInput && (
                <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                  <Text
                    style={tw`text-[18px] font-semibold text-gray-900 mb-3`}
                  >
                    Add Material Item
                  </Text>
                  <SelectList
                    setSelected={setSelectedMaterialItem}
                    data={availableMaterialItems}
                    placeholder="Select Material Item"
                    boxStyles={dropdownStyles.boxStyles}
                    inputStyles={dropdownStyles.inputStyles}
                    dropdownStyles={dropdownStyles.dropdownStyles}
                    dropdownItemStyles={(index) =>
                      dropdownStyles.dropdownItemStyles(index)
                    }
                  />
                  <TextInput
                    style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 mt-3 mb-3 text-[18px]`}
                    keyboardType="numeric"
                    value={materialQty}
                    onChangeText={setMaterialQty}
                    placeholder="Quantity"
                    placeholderTextColor="#999"
                  />
                  <SelectList
                    setSelected={setMaterialBidArea}
                    data={availableBidAreas}
                    placeholder="Select Bid Area"
                    boxStyles={dropdownStyles.boxStyles}
                    inputStyles={dropdownStyles.inputStyles}
                    dropdownStyles={dropdownStyles.dropdownStyles}
                    dropdownItemStyles={(index) =>
                      dropdownStyles.dropdownItemStyles(index)
                    }
                  />
                  <TouchableOpacity
                    style={tw`bg-green-600 p-4 rounded-lg mt-3`}
                    onPress={addMaterialItem}
                  >
                    <Text
                      style={tw`text-[18px] text-white text-center font-semibold`}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Rest of the Form */}
              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  Scope of Work
                </Text>
                <TextInput
                  style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 text-[18px]`}
                  multiline
                  numberOfLines={4}
                  value={scopeOfWork}
                  onChangeText={setScopeOfWork}
                  placeholder="Describe the work completed..."
                  placeholderTextColor="#999"
                />
              </View>

              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  Images
                </Text>
                <TouchableOpacity
                  style={tw`bg-indigo-600 p-4 rounded-lg mb-3`}
                  onPress={pickImage}
                >
                  <Text
                    style={tw`text-[18px] text-white text-center font-semibold`}
                  >
                    Add Images
                  </Text>
                </TouchableOpacity>
                {images.length > 0 && (
                  <ScrollView horizontal style={tw`flex-row mt-3`}>
                    {images.map((uri, index) => (
                      <Image
                        key={index}
                        source={{ uri }}
                        style={tw`w-24 h-24 rounded-lg mr-3`}
                      />
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  Signature
                </Text>
                {isEditing && signature ? (
                  <Image
                    source={{ uri: signature }}
                    style={tw`w-full h-48 rounded-lg mb-3`}
                  />
                ) : (
                  <TouchableOpacity
                    activeOpacity={1}
                    onPressIn={handleSignatureStart}
                    style={tw`w-full h-48`}
                  >
                    <Signature
                      ref={signatureRef}
                      onOK={handleSignatureCaptured}
                      onEmpty={handleSignatureEnd}
                      onStart={handleSignatureStart}
                      onEnd={handleSignatureEnd}
                      descriptionText="Sign here"
                      clearText="Clear"
                      confirmText="Save"
                      webStyle={signatureStyle}
                      style={tw`w-full h-48`}
                    />
                  </TouchableOpacity>
                )}
                <Text
                  style={tw`text-[18px] font-semibold text-gray-900 mt-4 mb-2`}
                >
                  Approved by
                </Text>
                <TextInput
                  style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 text-[18px]`}
                  value={approvedBy}
                  onChangeText={setApprovedBy}
                  placeholder="Enter name"
                  placeholderTextColor="#999"
                />
              </View>

              <TouchableOpacity
                style={tw`flex-row items-center bg-green-600 rounded-full p-4 mb-6 shadow-md`}
                onPress={handleSubmit}
              >
                <LinearGradient
                  colors={["#10b981", "#34d399"]}
                  style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                >
                  <FontAwesome name="paper-plane" size={20} color="white" />
                </LinearGradient>
                <Text style={tw`text-[18px] text-white font-semibold flex-1`}>
                  {isEditing ? "Update Entry" : "Save Entry"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                onPress={handleCreateToggle}
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
                  Cancel
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </TouchableWithoutFeedback>
    </View>
  );
}
