import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect, useLocalSearchParams } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";

const getProgressColor = (percentCompleted) => {
  const percentage = percentCompleted || 0;

  if (percentage >= 60) {
    return { color: "bg-green-500", textColor: "text-green-500", percentage };
  } else if (percentage >= 20) {
    return { color: "bg-yellow-500", textColor: "text-yellow-500", percentage };
  } else {
    return { color: "bg-red-500", textColor: "text-red-500", percentage };
  }
};

export default function ProgressLogScreen() {
  const router = useRouter();
  const { projectId } = useLocalSearchParams();
  const [mode, setMode] = useState(null);
  const [project, setProject] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [progressInputs, setProgressInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("workOrder");
  const [userRole, setUserRole] = useState(null);

  const resetForm = () => {
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setLineItems([]);
    setProgressInputs({});
    setStage("workOrder");
  };

  useFocusEffect(
    useCallback(() => {
      const checkLastTab = async () => {
        const lastTab = await AsyncStorage.getItem("lastTab");
        if (lastTab !== "progress-log") {
          setMode(null);
          setStage("workOrder");
        }
        if (mode === "update") loadWorkOrders();
        await AsyncStorage.setItem("lastTab", "progress-log");
      };
      checkLastTab();
    }, [mode, projectId])
  );

  useEffect(() => {
    const fetchUserRole = async () => {
      try {
        const userEmail = await SecureStore.getItemAsync("email");
        const token = await SecureStore.getItemAsync("authToken");
        if (!userEmail || !token) {
          setUserRole("unassigned");
          return;
        }
        const response = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${userEmail}`,
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        if (response.ok) {
          const data = await response.json();
          setUserRole(data.user.role || "unassigned");
        } else {
          setUserRole("unassigned");
        }
      } catch (error) {
        console.error("Error fetching user role:", error);
        setUserRole("unassigned");
      }
    };
    fetchUserRole();
  }, []);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        setLoading(true);
        const token = await SecureStore.getItemAsync("authToken");
        const response = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects/${projectId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        if (!response.ok) throw new Error("Failed to fetch project");
        setProject(data);
        const hourlyOrders = (data.workOrders || []).filter(
          (wo) => wo.type === "hourly"
        );
        setWorkOrders(hourlyOrders);
      } catch (error) {
        console.error("Error fetching project:", error);
        Alert.alert("Error", "Failed to load project.");
      } finally {
        setLoading(false);
      }
    };
    fetchProject();
  }, [projectId]);

  const handleSelectWorkOrder = (workOrder) => {
    setSelectedWorkOrder(workOrder);
    setLineItems(workOrder.lineItems || []);
    const initialProgress = {};
    (workOrder.lineItems || []).forEach((item) => {
      initialProgress[item._id.$oid || item._id] = "";
    });
    setProgressInputs(initialProgress);
    setStage("lineItems");
  };

  const handleProgressChange = (itemId, value) => {
    const numValue = parseFloat(value) || 0;
    if (numValue < 0 || numValue > 100) {
      Alert.alert("Error", "Progress must be between 0 and 100%");
      setProgressInputs((prev) => ({
        ...prev,
        [itemId]: numValue > 100 ? "100" : "0",
      }));
    } else {
      setProgressInputs((prev) => ({ ...prev, [itemId]: value }));
    }
  };

  const handleUpdateAllProgress = async () => {
    const updates = Object.entries(progressInputs)
      .filter(([_, value]) => value !== "" && value !== null)
      .map(([lineItemId, percentCompleted]) => ({
        lineItemId,
        percentCompleted: parseFloat(percentCompleted),
      }));

    if (updates.length === 0) {
      Alert.alert("Error", "Please enter at least one progress update.");
      return;
    }

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const workOrderId = selectedWorkOrder._id.$oid || selectedWorkOrder._id;

      for (const update of updates) {
        const response = await fetch(
          `https://erp-production-72da01c8e651.herokuapp.com/api/workorders/${workOrderId}/progress`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(update),
          }
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.message ||
              `Failed to update progress for ${update.lineItemId}`
          );
        }
      }

      const updatedResponse = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!updatedResponse.ok)
        throw new Error("Failed to fetch updated project data");
      const updatedProject = await updatedResponse.json();
      const updatedWorkOrder = updatedProject.workOrders.find(
        (wo) => (wo._id.$oid || wo._id) === workOrderId
      );
      setSelectedWorkOrder(updatedWorkOrder);
      setLineItems(updatedWorkOrder.lineItems || []);
      setProgressInputs((prev) => {
        const newInputs = {};
        Object.keys(prev).forEach((key) => (newInputs[key] = ""));
        return newInputs;
      });
      Alert.alert("Success", "All progress updates submitted successfully!");
    } catch (error) {
      console.error("Error updating progress:", error);
      Alert.alert("Error", error.message || "Failed to update progress.");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={tw`flex-1 bg-gray-100 justify-center items-center`}>
        <Text style={tw`text-2xl text-gray-900 font-bold`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-100 pb-32`}>
      <View style={tw`px-4 pt-2 pb-4`}>
        {/* Header Card */}
        <View
          style={tw`bg-white rounded-lg shadow-md p-4 mb-2 border border-gray-100`}
        >
          <Text style={tw`text-2xl font-bold text-gray-900`}>
            {project ? project.projectName : "Progress Log"} -
          </Text>

          <Text style={tw`text-sm text-gray-500 mt-1`}>Progress Log</Text>
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {!mode && (
            <>
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-gray-200 shadow-md`}
                onPress={() => setMode("update")}
              >
                <LinearGradient
                  colors={["#4f46e5", "#7c3aed"]}
                  style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                >
                  <FontAwesome name="edit" size={20} color="white" />
                </LinearGradient>
                <Text
                  style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                >
                  Update Progress
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                onPress={() => router.push("/(tabs)/projects")}
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

          {mode === "update" && (
            <>
              {stage === "workOrder" && (
                <>
                  <Text
                    style={tw`text-[18px] font-semibold text-gray-900 mb-4`}
                  >
                    Select Hourly Work Order
                  </Text>
                  {workOrders.map((workOrder) => (
                    <TouchableOpacity
                      key={workOrder._id.$oid || workOrder._id}
                      style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center border border-gray-100`}
                      onPress={() => handleSelectWorkOrder(workOrder)}
                    >
                      <View
                        style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                      >
                        <FontAwesome name="tasks" size={24} color="gray" />
                      </View>
                      <Text style={tw`text-[16px] text-gray-900 flex-1`}>
                        {workOrder.title}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                    onPress={() => setMode(null)}
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
              {stage === "lineItems" && (
                <>
                  {lineItems.map((item) => {
                    const itemId = item._id.$oid || item._id;
                    const latestProgress =
                      item.progressUpdates?.length > 0
                        ? item.progressUpdates[item.progressUpdates.length - 1]
                        : null;
                    const { color, textColor, percentage } = getProgressColor(
                      latestProgress ? latestProgress.percentCompleted : 0
                    );
                    return (
                      <View
                        key={itemId}
                        style={tw`bg-white rounded-xl p-4 mb-4 shadow-md border border-gray-100`}
                      >
                        <Text
                          style={tw`text-[16px] text-gray-900 font-medium mb-2`}
                        >
                          {item.title || "Item"}
                        </Text>
                        <Text style={tw`text-[14px] text-gray-600 mb-1`}>
                          Est. Quantity: {item.qtyEstimated || 0}{" "}
                          {item.uom || ""}
                        </Text>
                        <Text style={tw`text-[14px] text-gray-600 mb-1`}>
                          Labor Hours: {item.laborHoursEstimated || 0}
                        </Text>
                        <Text style={tw`text-[14px] ${textColor} mb-1`}>
                          Current Progress:{" "}
                          {latestProgress
                            ? `${latestProgress.percentCompleted}% (${latestProgress.unitsCompleted} ${item.uom})`
                            : "0%"}
                        </Text>
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
                            value={progressInputs[itemId] || ""}
                            onChangeText={(value) =>
                              handleProgressChange(itemId, value)
                            }
                            placeholder={
                              latestProgress
                                ? `${latestProgress.percentCompleted}`
                                : "0"
                            }
                            placeholderTextColor="#999"
                          />
                          <Text style={tw`text-[14px] text-gray-600 ml-3`}>
                            %
                          </Text>
                        </View>
                        {latestProgress && (
                          <Text style={tw`text-[12px] text-gray-500`}>
                            Last Updated:{" "}
                            {new Date(
                              latestProgress.updatedAt
                            ).toLocaleDateString()}
                          </Text>
                        )}
                      </View>
                    );
                  })}
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                    onPress={handleUpdateAllProgress}
                    disabled={loading}
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
                      {loading ? "Updating..." : "Update Progress"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                    onPress={() => setStage("workOrder")}
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
    </View>
  );
}
