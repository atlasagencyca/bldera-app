import React, { useState, useEffect } from "react";
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

// Function to calculate availability percentage and determine color
const getAvailabilityColor = (estimated, installed, pending) => {
  const totalUsed = (installed || 0) + (pending || 0);
  const available = (estimated || 0) - totalUsed;
  const percentage = estimated > 0 ? (available / estimated) * 100 : 0;

  if (percentage >= 60) {
    return { color: "bg-green-500", textColor: "text-green-500", percentage };
  } else if (percentage >= 20) {
    return { color: "bg-yellow-500", textColor: "text-yellow-500", percentage };
  } else {
    return { color: "bg-red-500", textColor: "text-red-500", percentage };
  }
};

export default function PieceworkScreen() {
  const router = useRouter();
  const [mode, setMode] = useState(null); // "create" or "history"
  const [historyTab, setHistoryTab] = useState("pending"); // "pending" or "approved"
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const { fromTab } = useLocalSearchParams();
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [quantities, setQuantities] = useState({});
  const [allLogs, setAllLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("project");
  const [payPeriod, setPayPeriod] = useState(null);
  const [sundayDates, setSundayDates] = useState([]); // Dynamic Sundays
  const [userRole, setUserRole] = useState(null); // User role state
  const [isDropdownOpen, setIsDropdownOpen] = useState(false); // For custom dropdown

  // Generate Sundays dynamically starting from the current week's Sunday
  useEffect(() => {
    const generateSundays = () => {
      const dates = [];
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const dayOfWeek = today.getDay();
      const daysToSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
      const currentSunday = new Date(today);
      if (dayOfWeek !== 0) {
        currentSunday.setDate(today.getDate() + daysToSunday);
      }

      for (let i = 0; i < 12; i++) {
        const sunday = new Date(currentSunday);
        sunday.setDate(currentSunday.getDate() - i * 7);
        dates.push({
          value: sunday.toISOString().split("T")[0],
          label: sunday.toLocaleDateString("en-US", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
        });
      }

      setSundayDates(dates);
      setPayPeriod(dates[0].value);
    };
    generateSundays();
  }, []);

  const resetForm = () => {
    setSelectedProject(null);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setEmployees([]);
    setSelectedEmployee(null);
    setLineItems([]);
    setQuantities({});
    setStage("project");
    setPayPeriod(sundayDates[0]?.value || null);
  };

  useFocusEffect(
    React.useCallback(() => {
      const checkLastTab = async () => {
        const lastTab = await AsyncStorage.getItem("lastTab");

        if (lastTab === "clock-in-out" || lastTab === "material-order") {
          setMode(null);
          setSelectedLog(null);
          setStage("project");
        }
        if (mode === "create") loadProjects();
        if (mode === "history") loadAllLogs();
        await AsyncStorage.setItem("lastTab", "piecework");
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
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects/piecework",
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

  const loadAllLogs = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      if (!token) throw new Error("Authentication token not found");
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/pieceworkerLogs",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!response.ok) throw new Error("Failed to fetch pieceworker logs");
      const data = await response.json();
      setAllLogs(data);
      setFilteredLogs(data.filter((log) => log.status === "pending"));
    } catch (error) {
      console.error("Error fetching pieceworker logs:", error);
      Alert.alert("Error", "Failed to load pieceworker logs.");
    } finally {
      setLoading(false);
    }
  };

  useFocusEffect(
    React.useCallback(() => {
      if (mode === "create") loadProjects();
      if (mode === "history") loadAllLogs();
    }, [mode])
  );

  useEffect(() => {
    const statusMap = {
      pending: "pending",
      approved: "approved",
    };
    setFilteredLogs(
      allLogs.filter((log) => log.status === statusMap[historyTab])
    );
  }, [historyTab, allLogs]);

  const handleSelectProject = (project) => {
    setSelectedProject(project);
    const pieceworkOrders = (project.workOrders || []).filter(
      (wo) => wo.type === "piecework"
    );
    setWorkOrders(pieceworkOrders);
    setStage("workOrder");
  };

  const handleSelectWorkOrder = async (workOrder) => {
    setSelectedWorkOrder(workOrder);
    setLineItems(workOrder.lineItems || []);
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/pieceworkers",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
      }
    } catch (error) {
      console.error("Failed to load pieceworkers:", error);
      Alert.alert("Error", "Failed to load pieceworkers.");
    }
    setStage("employee");
  };

  const handleSelectEmployee = (employee) => {
    setSelectedEmployee(employee);
    setStage("payPeriod");
  };

  const handlePayPeriodConfirm = () => {
    if (!payPeriod) {
      Alert.alert("Error", "Please select a pay period.");
      return;
    }
    const initialQuantities = {};
    (selectedWorkOrder.lineItems || []).forEach((item) => {
      initialQuantities[item._id.$oid || item._id] = "";
    });
    setQuantities(initialQuantities);
    setStage("lineItems");
  };

  const handleQuantityChange = (itemId, value) => {
    const numValue = parseFloat(value) || 0;
    const item = lineItems.find((li) => (li._id.$oid || li._id) === itemId);
    const maxQty =
      (item.qtyEstimated || 0) -
      (item.qtyInstalled || 0) -
      (item.qtyPending || 0);
    if (numValue > maxQty) {
      Alert.alert("Error", `Quantity cannot exceed ${maxQty} ${item.uom}`);
      setQuantities((prev) => ({ ...prev, [itemId]: maxQty.toString() }));
    } else {
      setQuantities((prev) => ({ ...prev, [itemId]: value }));
    }
  };

  const handleSubmit = async () => {
    if (!selectedEmployee || Object.keys(quantities).length === 0) {
      Alert.alert("Error", "Please select an employee and enter quantities.");
      return;
    }
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const pieceworkerLog = {
        projectId: selectedProject._id.$oid || selectedProject._id,
        workOrderId: selectedWorkOrder._id.$oid || selectedWorkOrder._id,
        employeeId: selectedEmployee._id.$oid || selectedEmployee._id,
        woNumber: selectedWorkOrder.woNumber || selectedEmployee._id,
        lineItems: lineItems.map((item) => {
          const itemId = item._id.$oid || item._id;
          return {
            lineItemId: itemId,
            title: item.title || "Untitled",
            quantity: parseFloat(quantities[itemId] || 0),
            uom: item.uom,
            unitCost: item.unitCost,
          };
        }),
        workCompletedDate: payPeriod,
        status: "pending",
        submittedAt: new Date().toISOString(),
      };

      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/pieceworkerLogs",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(pieceworkerLog),
        }
      );
      if (response.ok) {
        Alert.alert("Success", "Worksheet submitted for approval.");
        resetForm();
        setMode(null);
      } else {
        throw new Error("Failed to submit worksheet");
      }
    } catch (error) {
      console.error("Error submitting worksheet:", error);
      Alert.alert("Error", "Failed to submit worksheet.");
    }
  };

  const handleApproveLog = async (logId) => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/pieceworkerLogs/${logId}/approve`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        Alert.alert("Success", "Worksheet approved.");
        setAllLogs(
          allLogs.map((log) =>
            log._id === logId ? { ...log, status: "approved" } : log
          )
        );
        setFilteredLogs(filteredLogs.filter((log) => log._id !== logId));
        setSelectedLog(null);
      } else {
        throw new Error("Failed to approve worksheet");
      }
    } catch (error) {
      console.error("Error approving worksheet:", error);
      Alert.alert("Error", "Failed to approve worksheet.");
    }
  };

  const handleViewLog = (log) => {
    setSelectedLog(log);
  };

  const handleRejectLog = async (logId) => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/pieceworkerLogs/${logId}/reject`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (response.ok) {
        Alert.alert("Success", "Worksheet rejected.");
        setAllLogs(
          allLogs.map((log) =>
            log._id === logId ? { ...log, status: "rejected" } : log
          )
        );
        setFilteredLogs(filteredLogs.filter((log) => log._id !== logId));
        setSelectedLog(null);
      } else {
        throw new Error("Failed to reject worksheet");
      }
    } catch (error) {
      console.error("Error rejecting worksheet:", error);
      Alert.alert("Error", "Failed to reject worksheet.");
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
              Piecework Management
            </Text>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-gray-200 shadow-md`}
              onPress={() => setMode("create")}
            >
              <LinearGradient
                colors={["#4f46e5", "#7c3aed"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="plus" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Create New Worksheet
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mb-4 border border-gray-200 shadow-md`}
              onPress={() => setMode("history")}
            >
              <LinearGradient
                colors={["#10b981", "#34d399"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="history" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Worksheet History
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

        {/* Create Mode */}
        {mode === "create" && (
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
                  Select Work Order
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
            {stage === "employee" && (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Pieceworker
                </Text>
                {employees.map((employee) => (
                  <TouchableOpacity
                    key={employee._id.$oid || employee._id}
                    style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
                    onPress={() => handleSelectEmployee(employee)}
                  >
                    <View
                      style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                    >
                      <FontAwesome name="user" size={24} color="gray" />
                    </View>
                    <Text style={tw`text-[16px] text-gray-900 flex-1`}>
                      {employee.displayName || employee.email}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
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
            {stage === "payPeriod" && (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Pay Period for{" "}
                  {selectedEmployee?.displayName ||
                    selectedEmployee?.email ||
                    "Employee"}
                </Text>
                <View style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}>
                  <TouchableOpacity
                    style={tw`flex-row items-center justify-between border border-gray-300 rounded-lg p-3`}
                    onPress={() => setIsDropdownOpen(!isDropdownOpen)}
                  >
                    <Text style={tw`text-[16px] text-gray-900`}>
                      {sundayDates.find((d) => d.value === payPeriod)?.label ||
                        "Select a pay period"}
                    </Text>
                    <FontAwesome
                      name={isDropdownOpen ? "chevron-up" : "chevron-down"}
                      size={16}
                      color="#666"
                    />
                  </TouchableOpacity>
                  {isDropdownOpen && (
                    <View
                      style={tw`mt-2 max-h-40 border border-gray-300 rounded-lg bg-white shadow-md`}
                    >
                      <ScrollView nestedScrollEnabled>
                        {sundayDates.map((date) => (
                          <TouchableOpacity
                            key={date.value}
                            style={tw`p-3 border-b border-gray-200`}
                            onPress={() => {
                              setPayPeriod(date.value);
                              setIsDropdownOpen(false);
                            }}
                          >
                            <Text style={tw`text-[16px] text-gray-900`}>
                              {date.label}
                            </Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                  onPress={handlePayPeriodConfirm}
                >
                  <LinearGradient
                    colors={["#10b981", "#34d399"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="check" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Confirm Pay Period
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("employee")}
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
                  Report Quantities for{" "}
                  {selectedEmployee?.displayName ||
                    selectedEmployee?.email ||
                    "Employee"}{" "}
                  - Pay Period Ending{" "}
                  {sundayDates.find((d) => d.value === payPeriod)?.label ||
                    payPeriod}
                </Text>
                {lineItems.map((item) => {
                  const itemId = item._id.$oid || item._id;
                  const remainingQty =
                    (item.qtyEstimated || 0) -
                    (item.qtyInstalled || 0) -
                    (item.qtyPending || 0);
                  const { color, textColor, percentage } = getAvailabilityColor(
                    item.qtyEstimated,
                    item.qtyInstalled,
                    item.qtyPending
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
                      <View style={tw`flex-row justify-between mb-1`}>
                        <Text style={tw`text-[14px] text-gray-600`}>
                          Est: {(item.qtyEstimated || 0).toLocaleString()}{" "}
                          {item.uom}
                        </Text>
                        <Text style={tw`text-[14px] text-gray-600`}>
                          Inst: {(item.qtyInstalled || 0).toLocaleString()}{" "}
                          {item.uom}
                        </Text>
                      </View>
                      <View style={tw`flex-row justify-between mb-1`}>
                        <Text style={tw`text-[14px] text-gray-600`}>
                          Pend: {(item.qtyPending || 0).toLocaleString()}{" "}
                          {item.uom}
                        </Text>
                        <Text style={tw`text-[14px] ${textColor}`}>
                          Avail: {remainingQty.toLocaleString()} {item.uom} (
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
                          value={quantities[itemId] || ""}
                          onChangeText={(value) =>
                            handleQuantityChange(itemId, value)
                          }
                          placeholder="Qty"
                          placeholderTextColor="#999"
                        />
                        <Text style={tw`text-[14px] text-gray-600 ml-3`}>
                          {item.uom}
                        </Text>
                      </View>
                      <Text style={tw`text-[14px] text-gray-900`}>
                        Unit Cost: ${item.unitCost.toFixed(2)} | Total: $
                        {((quantities[itemId] || 0) * item.unitCost).toFixed(2)}
                      </Text>
                    </View>
                  );
                })}
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
                    Submit Worksheet
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("payPeriod")}
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

        {/* History Mode */}
        {mode === "history" && !selectedLog && (
          <>
            <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
              Worksheet History
            </Text>
            <View
              style={tw`flex-row mb-4 bg-white rounded-full p-1 border border-gray-200 shadow-md`}
            >
              <TouchableOpacity
                style={tw`flex-1 rounded-full py-2 ${
                  historyTab === "pending" ? "bg-gray-100" : ""
                }`}
                onPress={() => setHistoryTab("pending")}
              >
                <Text
                  style={tw`text-[16px] text-gray-900 font-semibold text-center ${
                    historyTab === "pending" ? "text-indigo-600" : ""
                  }`}
                >
                  Pending
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={tw`flex-1 rounded-full py-2 ${
                  historyTab === "approved" ? "bg-gray-100" : ""
                }`}
                onPress={() => setHistoryTab("approved")}
              >
                <Text
                  style={tw`text-[16px] text-gray-900 font-semibold text-center ${
                    historyTab === "approved" ? "text-indigo-600" : ""
                  }`}
                >
                  Approved
                </Text>
              </TouchableOpacity>
            </View>
            {filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <View
                  key={log._id}
                  style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                >
                  <View style={tw`flex-row justify-between`}>
                    <Text style={tw`text-[16px] text-gray-900 font-medium`}>
                      Project:
                    </Text>
                    <Text style={tw`text-[16px] text-gray-900`}>
                      {log.project.projectName || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      Work Order:
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.workOrder.title || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      WO Number:
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.workOrder.woNumber || log.workOrder?._id || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>Employee:</Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.user.displayName || log.user?.email || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>Status:</Text>
                    <Text
                      style={tw`text-[14px] ${
                        log.status === "approved"
                          ? "text-green-600"
                          : "text-yellow-600"
                      }`}
                    >
                      {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
                    </Text>
                  </View>
                  <View style={tw`flex-row mt-2 justify-end`}>
                    <TouchableOpacity
                      style={tw`flex-row items-center bg-white rounded-full p-2 border border-blue-500`}
                      onPress={() => handleViewLog(log)}
                    >
                      <FontAwesome name="eye" size={16} color="#3b82f6" />
                      <Text style={tw`text-[14px] text-blue-600 ml-2`}>
                        View
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            ) : (
              <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                No {historyTab} worksheets
              </Text>
            )}
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
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Go Back
              </Text>
            </TouchableOpacity>
          </>
        )}

        {mode === "history" && selectedLog && (
          <>
            <Text
              style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
            >
              Worksheet Details for{" "}
              {selectedLog.user?.displayName || selectedLog.user?.email} - Pay
              Period Ending{" "}
              {new Date(selectedLog.workCompletedDate).toLocaleDateString()}
            </Text>
            {selectedLog.lineItems.map((item) => {
              const itemId = item.lineItemId.$oid || item.lineItemId;
              return (
                <View
                  key={itemId}
                  style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                >
                  <Text style={tw`text-[16px] text-gray-900 font-medium mb-2`}>
                    {item.title}
                  </Text>
                  <Text style={tw`text-[14px] text-gray-600 mb-3`}>
                    Quantity: {item.qtyInstalled} {item.uom}
                  </Text>
                  <Text style={tw`text-[14px] text-gray-900`}>
                    Unit Cost: ${item.unitCost.toFixed(2)} | Total: $
                    {(item.qtyInstalled * item.unitCost).toFixed(2)}
                  </Text>
                </View>
              );
            })}

            {historyTab === "pending" && (
              <>
                {userRole === "admin" && (
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-green-500 shadow-md`}
                    onPress={() => handleApproveLog(selectedLog._id)}
                  >
                    <FontAwesome name="check" size={20} color="#10b981" />
                    <Text
                      style={tw`text-[18px] text-green-600 ml-3 font-semibold flex-1`}
                    >
                      Approve Worksheet
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-red-500 shadow-md`}
                  onPress={() => handleRejectLog(selectedLog._id)}
                >
                  <FontAwesome name="times" size={20} color="#ef4444" />
                  <Text
                    style={tw`text-[18px] text-red-600 ml-3 font-semibold flex-1`}
                  >
                    Reject Worksheet
                  </Text>
                </TouchableOpacity>
              </>
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
              onPress={() => setSelectedLog(null)}
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
        )}
      </ScrollView>
    </View>
  );
}
