import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as SecureStore from "expo-secure-store";

// Function to determine progress bar color based on percentage
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
  const [mode, setMode] = useState(null); // "update" or "history"
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [progressInputs, setProgressInputs] = useState({});
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("project");
  const [userRole, setUserRole] = useState(null);

  const resetForm = () => {
    setSelectedProject(null);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setLineItems([]);
    setProgressInputs({});
    setStage("project");
  };

  useFocusEffect(
    React.useCallback(() => {
      const checkLastTab = async () => {
        const lastTab = await AsyncStorage.getItem("lastTab");
        if (lastTab !== "progress-log") {
          setMode(null);
          setStage("project");
        }
        if (mode === "update") loadProjects();
        await AsyncStorage.setItem("lastTab", "progress-log");
      };
      checkLastTab();
    }, [mode])
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

  const loadProjects = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects/hourly",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Failed to fetch projects");
      const data = await response.json();
      setProjects(data);
      await AsyncStorage.setItem("projects", JSON.stringify(data));
    } catch (error) {
      console.error("Failed to load projects:", error);
      Alert.alert("Error", "Failed to load projects. Loading cached data...");
      const storedProjects = await AsyncStorage.getItem("projects");
      if (storedProjects) setProjects(JSON.parse(storedProjects));
    } finally {
      setLoading(false);
    }
  };

  const fetchProjectDetails = async (projectId) => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/projects/${projectId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      if (!response.ok) throw new Error("Failed to fetch project details");
      const projectData = await response.json();
      const hourlyOrders = (projectData.workOrders || []).filter(
        (wo) => wo.type === "hourly"
      );
      setWorkOrders(hourlyOrders);
      return projectData;
    } catch (error) {
      console.error("Failed to fetch project details:", error);
      Alert.alert("Error", "Failed to load project details.");
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleSelectProject = async (project) => {
    try {
      const detailedProject = await fetchProjectDetails(
        project._id.$oid || project._id
      );
      setSelectedProject(detailedProject);
      setStage("workOrder");
    } catch (error) {
      setStage("project");
    }
  };

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

      // Send all updates in a single request (assuming backend supports batch updates)
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

      // Fetch updated work order after all updates
      const updatedResponse = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/projects/${
          selectedProject._id.$oid || selectedProject._id
        }`,
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
      <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <Text style={tw`text-[20px] text-gray-900 mb-6`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50 p-6`}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Mode Selection */}
        {!mode && (
          <>
            <Text
              style={tw`text-[24px] font-bold text-gray-900 mb-6 text-center`}
            >
              Progress Log
            </Text>
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
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Update Progress
              </Text>
            </TouchableOpacity>
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

        {/* Update Mode */}
        {mode === "update" && (
          <>
            {stage === "project" && (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Project
                </Text>
                {projects.map((project) => (
                  <TouchableOpacity
                    key={project._id.$oid || project._id}
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
            {stage === "workOrder" && (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Hourly Work Order
                </Text>
                {workOrders.map((workOrder) => (
                  <TouchableOpacity
                    key={workOrder._id.$oid || workOrder._id}
                    style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
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
                  onPress={() => setStage("project")}
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
                <Text
                  style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
                >
                  Update Progress for {selectedWorkOrder.title} (WO#
                  {selectedWorkOrder.woNumber})
                </Text>
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
                      style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                    >
                      <Text
                        style={tw`text-[16px] text-gray-900 font-medium mb-2`}
                      >
                        {item.title || "Item"}
                      </Text>
                      <Text style={tw`text-[14px] text-gray-600 mb-1`}>
                        Est. Quantity: {item.qtyEstimated || 0} {item.uom || ""}
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
  );
}
