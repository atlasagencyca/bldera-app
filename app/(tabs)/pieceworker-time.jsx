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

// Utility function to calculate availability percentage and color
const getAvailabilityColor = (estimated, installed, pending) => {
  const totalUsed = (installed || 0) + (pending || 0);
  const available = (estimated || 0) - totalUsed;
  const percentage = estimated > 0 ? (available / estimated) * 100 : 0;

  if (percentage >= 60) {
    return { color: "bg-green-500", textColor: "text-green-500", percentage };
  } else if (percentage >= 20) {
    return { color: "bg-yellow-500", textColor: "text-yellow-500", percentage };
  }
  return { color: "bg-red-500", textColor: "text-red-500", percentage };
};

/**
 * PieceworkScreen component for managing piecework logs.
 * Allows creating logs across multiple bid areas for a single employee and pay period,
 * with a summary view before submission. Prevents duplicate bid areas, pre-populates
 * quantities for existing bid areas, shows an "Add Items" button when the summary is empty,
 * and navigates to bidArea from lineItems on "Go Back".
 */
export default function PieceworkScreen() {
  const router = useRouter();
  const { fromTab } = useLocalSearchParams();

  // State declarations
  const [mode, setMode] = useState(null); // "create" or "history"
  const [historyTab, setHistoryTab] = useState("pending"); // "pending", "approved", "rejected"
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [workOrders, setWorkOrders] = useState([]);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [bidAreas, setBidAreas] = useState([]);
  const [selectedBidArea, setSelectedBidArea] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [lineItems, setLineItems] = useState([]);
  const [quantities, setQuantities] = useState({}); // { bidArea: { itemId: quantity } }
  const [pieceworkLog, setPieceworkLog] = useState([]); // [{ bidArea, items: [{ lineItemId, title, quantity, uom, unitCost }] }]
  const [allLogs, setAllLogs] = useState([]);
  const [filteredLogs, setFilteredLogs] = useState([]);
  const [selectedLog, setSelectedLog] = useState(null);
  const [loading, setLoading] = useState(false);
  const [stage, setStage] = useState("project"); // project -> workOrder -> bidArea -> employee -> payPeriod -> lineItems -> summary
  const [payPeriod, setPayPeriod] = useState(null);
  const [sundayDates, setSundayDates] = useState([]);
  const [userRole, setUserRole] = useState(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Generate Sundays for pay period selection
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
      setPayPeriod(dates[0]?.value || null);
    };
    generateSundays();
  }, []);

  /**
   * Resets the form to initial state.
   */
  const resetForm = () => {
    setSelectedProject(null);
    setWorkOrders([]);
    setSelectedWorkOrder(null);
    setBidAreas([]);
    setSelectedBidArea(null);
    setEmployees([]);
    setSelectedEmployee(null);
    setLineItems([]);
    setQuantities({});
    setPieceworkLog([]);
    setStage("project");
    setPayPeriod(sundayDates[0]?.value || null);
  };

  /**
   * Clears logs and resets relevant states when navigating to employee selection.
   */
  const clearLogs = () => {
    setPieceworkLog([]);
    setQuantities({});
    setSelectedBidArea(null);
    setPayPeriod(sundayDates[0]?.value || null);
  };

  /**
   * Loads user role from secure storage.
   */
  useEffect(() => {
    const loadUserRole = async () => {
      try {
        const storedRole = await SecureStore.getItemAsync("userRole");
        setUserRole(storedRole || "unassigned");
      } catch (error) {
        console.error("Error loading user role:", error);
        setUserRole("unassigned");
      }
    };
    loadUserRole();
  }, []);

  /**
   * Loads projects from the API or cache.
   */
  const loadProjects = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects",
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();

      if (!response.ok) throw new Error("Failed to fetch projects");

      setProjects(data || []);
      await AsyncStorage.setItem("projects", JSON.stringify(data || []));
    } catch (error) {
      console.error("Failed to load projects:", error);
      Alert.alert("Error", "Failed to load projects. Loading cached data...");
      const storedProjects = await AsyncStorage.getItem("projects");
      if (storedProjects) setProjects(JSON.parse(storedProjects) || []);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Loads all pieceworker logs from the API.
   */
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
      setAllLogs(data || []);
      setFilteredLogs(data.filter((log) => log.status === "pending") || []);
    } catch (error) {
      console.error("Error fetching pieceworker logs:", error);
      Alert.alert("Error", "Failed to load pieceworker logs.");
    } finally {
      setLoading(false);
    }
  };

  // Handle focus effect for tab navigation
  useFocusEffect(
    useCallback(() => {
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

  // Filter logs based on history tab
  useEffect(() => {
    setFilteredLogs(allLogs.filter((log) => log.status === historyTab));
  }, [historyTab, allLogs]);

  /**
   * Handles project selection and loads work orders.
   * @param {Object} project - Selected project object
   */
  const handleSelectProject = (project) => {
    setSelectedProject(project);
    const pieceworkOrders = (project.workOrders || []).filter(
      (wo) => wo.type === "piecework"
    );
    setWorkOrders(pieceworkOrders);
    setStage("workOrder");
  };

  /**
   * Handles work order selection and loads bid areas.
   * @param {Object} workOrder - Selected work order object
   */
  const handleSelectWorkOrder = async (workOrder) => {
    setSelectedWorkOrder(workOrder);
    setLineItems(workOrder.lineItems || []);
    try {
      const uniqueBidAreas = [
        ...new Set(
          (workOrder.lineItems || [])
            .map((item) => item.bidArea)
            .filter((bidArea) => bidArea && bidArea !== "(unassigned)")
        ),
      ];
      setBidAreas(uniqueBidAreas);
    } catch (error) {
      console.error("Failed to load bid areas:", error);
      Alert.alert("Error", "Failed to load bid areas.");
      setBidAreas([]);
    }
    setStage("bidArea");
  };

  /**
   * Handles bid area selection and loads employees or skips to line items.
   * Pre-populates quantities if the bid area exists in pieceworkLog.
   * @param {string} bidArea - Selected bid area
   */
  const handleSelectBidArea = async (bidArea) => {
    setSelectedBidArea(bidArea);
    if (selectedEmployee) {
      // If employee is already selected, skip to pay period or line items
      if (payPeriod) {
        const initialQuantities = {};
        (selectedWorkOrder.lineItems || [])
          .filter((item) => item.bidArea === bidArea)
          .forEach((item) => {
            initialQuantities[item._id.$oid || item._id] = "";
          });

        // Pre-populate quantities from pieceworkLog if the bid area exists
        const existingLog = pieceworkLog.find(
          (entry) => entry.bidArea === bidArea
        );
        if (existingLog) {
          existingLog.items.forEach((item) => {
            initialQuantities[item.lineItemId] = item.quantity.toString();
          });
        }

        setQuantities((prev) => ({
          ...prev,
          [bidArea]: initialQuantities,
        }));
        setStage("lineItems");
      } else {
        setStage("payPeriod");
      }
    } else {
      setStage("employee");
      try {
        const token = await SecureStore.getItemAsync("authToken");
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/pieceworkers",
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.ok) {
          const data = await response.json();
          setEmployees(data || []);
        } else {
          throw new Error("Failed to fetch pieceworkers");
        }
      } catch (error) {
        console.error("Failed to load pieceworkers:", error);
        Alert.alert("Error", "Failed to load pieceworkers.");
      }
    }
  };

  /**
   * Handles navigation to employee selection with confirmation alert if logs exist.
   */
  const handleNavigateToEmployee = () => {
    if (pieceworkLog.length > 0) {
      Alert.alert(
        "Confirm Navigation",
        "Are you sure you want to go back? Your logs for the current employee will be erased.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OK",
            onPress: () => {
              clearLogs();
              setSelectedEmployee(null);
              setStage("employee");
            },
          },
        ]
      );
    } else {
      setStage("employee");
    }
  };

  /**
   * Handles employee selection and clears previous logs if confirmed.
   * @param {Object} employee - Selected employee object
   */
  const handleSelectEmployee = (employee) => {
    if (selectedEmployee && pieceworkLog.length > 0) {
      Alert.alert(
        "Confirm Employee Change",
        "Changing the employee will erase all current logs. Are you sure?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "OK",
            onPress: () => {
              clearLogs();
              setSelectedEmployee(employee);
              setStage("payPeriod");
            },
          },
        ]
      );
    } else {
      setSelectedEmployee(employee);
      setStage("payPeriod");
    }
  };

  /**
   * Confirms pay period selection and initializes quantities.
   */
  const handlePayPeriodConfirm = () => {
    if (!payPeriod) {
      Alert.alert("Error", "Please select a pay period.");
      return;
    }
    const initialQuantities = {};
    (selectedWorkOrder.lineItems || [])
      .filter((item) => item.bidArea === selectedBidArea)
      .forEach((item) => {
        initialQuantities[item._id.$oid || item._id] = "";
      });

    // Pre-populate quantities from pieceworkLog if the bid area exists
    const existingLog = pieceworkLog.find(
      (entry) => entry.bidArea === selectedBidArea
    );
    if (existingLog) {
      existingLog.items.forEach((item) => {
        initialQuantities[item.lineItemId] = item.quantity.toString();
      });
    }

    setQuantities((prev) => ({
      ...prev,
      [selectedBidArea]: initialQuantities,
    }));
    setStage("lineItems");
  };

  /**
   * Handles quantity changes for line items.
   * @param {string} itemId - Line item ID
   * @param {string} value - Quantity value
   */
  const handleQuantityChange = (itemId, value) => {
    const numValue = parseFloat(value) || 0;
    const item = lineItems.find((li) => (li._id.$oid || li._id) === itemId);
    const maxQty =
      (item.qtyEstimated || 0) -
      (item.qtyInstalled || 0) -
      (item.qtyPending || 0);
    if (numValue > maxQty) {
      Alert.alert("Error", `Quantity cannot exceed ${maxQty} ${item.uom}`);
      setQuantities((prev) => ({
        ...prev,
        [selectedBidArea]: {
          ...prev[selectedBidArea],
          [itemId]: maxQty.toString(),
        },
      }));
    } else {
      setQuantities((prev) => ({
        ...prev,
        [selectedBidArea]: {
          ...prev[selectedBidArea],
          [itemId]: value,
        },
      }));
    }
  };

  /**
   * Saves current bid area items to the piecework log if not a duplicate and navigates back to bid area selection.
   */
  const handleSaveItems = () => {
    const currentQuantities = quantities[selectedBidArea] || {};
    const hasValidQuantities = Object.values(currentQuantities).some(
      (qty) => parseFloat(qty) > 0
    );

    if (!hasValidQuantities) {
      Alert.alert("Error", "Please enter at least one valid quantity.");
      return;
    }

    // Check for duplicate bid area
    const existingLogIndex = pieceworkLog.findIndex(
      (entry) => entry.bidArea === selectedBidArea
    );
    if (existingLogIndex !== -1) {
      Alert.alert(
        "Duplicate Bid Area",
        "This bid area is already in the log. Please edit it in the summary.",
        [
          {
            text: "OK",
            onPress: () => setStage("summary"),
          },
        ]
      );
      return;
    }

    const newLogEntry = {
      bidArea: selectedBidArea,
      items: lineItems
        .filter((item) => item.bidArea === selectedBidArea)
        .map((item) => {
          const itemId = item._id.$oid || item._id;
          return {
            lineItemId: itemId,
            title: item.title || "Untitled",
            quantity: parseFloat(currentQuantities[itemId] || 0),
            uom: item.uom,
            unitCost: item.unitCost,
          };
        })
        .filter((item) => item.quantity > 0),
    };

    setPieceworkLog((prev) => [...prev, newLogEntry]);
    setSelectedBidArea(null);
    setStage("bidArea");
  };

  /**
   * Submits the entire piecework log to the API.
   */
  const handleSubmit = async () => {
    if (pieceworkLog.length === 0) {
      Alert.alert("Error", "No items added to the piecework log.");
      return;
    }

    if (!selectedEmployee || !payPeriod) {
      Alert.alert("Error", "Employee and pay period must be selected.");
      return;
    }

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const logsToSubmit = pieceworkLog.map((entry) => ({
        projectId: selectedProject._id.$oid || selectedProject._id,
        workOrderId: selectedWorkOrder._id.$oid || selectedWorkOrder._id,
        bidArea: entry.bidArea,
        employeeId: selectedEmployee._id.$oid || selectedEmployee._id,
        woNumber: selectedWorkOrder.woNumber || selectedWorkOrder._id,
        lineItems: entry.items,
        workCompletedDate: payPeriod,
        status: "pending",
        submittedAt: new Date().toISOString(),
      }));

      // Note: If the backend supports a single submission with multiple bid areas,
      // modify to send one POST request with all logsToSubmit as an array.
      for (const log of logsToSubmit) {
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/pieceworkerLogs",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(log),
          }
        );
        if (!response.ok) {
          throw new Error("Failed to submit worksheet");
        }
      }

      Alert.alert("Success", "Piecework log submitted for approval.");
      resetForm();
      setMode(null);
    } catch (error) {
      console.error("Error submitting worksheet:", error);
      Alert.alert("Error", "Failed to submit worksheet.");
    } finally {
      setLoading(false);
    }
  };

  /**
   * Approves a pieceworker log.
   * @param {string} logId - Log ID to approve
   */
  const handleApproveLog = async (logId) => {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  /**
   * Rejects a pieceworker log.
   * @param {string} logId - Log ID to reject
   */
  const handleRejectLog = async (logId) => {
    try {
      setLoading(true);
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
    } finally {
      setLoading(false);
    }
  };

  /**
   * Views a pieceworker log.
   * @param {Object} log - Log to view
   */
  const handleViewLog = (log) => {
    setSelectedLog(log);
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
            {stage === "bidArea" && (
              <>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-4`}>
                  Select Bid Area
                </Text>
                {bidAreas.length > 0 ? (
                  bidAreas.map((bidArea) => (
                    <TouchableOpacity
                      key={bidArea}
                      style={tw`bg-white rounded-xl p-4 mb-4 shadow-md flex-row items-center`}
                      onPress={() => handleSelectBidArea(bidArea)}
                    >
                      <View
                        style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                      >
                        <FontAwesome name="map" size={24} color="gray" />
                      </View>
                      <Text style={tw`text-[16px] text-gray-900 flex-1`}>
                        {bidArea}
                      </Text>
                    </TouchableOpacity>
                  ))
                ) : (
                  <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                    No bid areas available for this work order
                  </Text>
                )}
                {pieceworkLog.length > 0 && (
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                    onPress={() => setStage("summary")}
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
                      View Summary
                    </Text>
                  </TouchableOpacity>
                )}
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
                  onPress={() => setStage("bidArea")}
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
                  onPress={handleNavigateToEmployee}
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
                  - Bid Area: {selectedBidArea}
                </Text>
                {lineItems
                  .filter((item) => item.bidArea === selectedBidArea)
                  .map((item) => {
                    const itemId = item._id.$oid || item._id;
                    const remainingQty =
                      (item.qtyEstimated || 0) -
                      (item.qtyInstalled || 0) -
                      (item.qtyPending || 0);
                    const { color, textColor, percentage } =
                      getAvailabilityColor(
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
                            value={quantities[selectedBidArea]?.[itemId] || ""}
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
                          {(
                            (quantities[selectedBidArea]?.[itemId] || 0) *
                            item.unitCost
                          ).toFixed(2)}
                        </Text>
                      </View>
                    );
                  })}
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                  onPress={handleSaveItems}
                >
                  <LinearGradient
                    colors={["#4f46e5", "#7c3aed"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="save" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Save and Add More
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("summary")}
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
                    Proceed to Summary
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("bidArea")}
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
            {stage === "summary" && (
              <>
                <Text
                  style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
                >
                  Piecework Log Summary for{" "}
                  {selectedEmployee?.displayName ||
                    selectedEmployee?.email ||
                    "Employee"}
                </Text>
                <Text style={tw`text-[16px] text-gray-600 mb-4 text-center`}>
                  Pay Period Ending:{" "}
                  {sundayDates.find((d) => d.value === payPeriod)?.label ||
                    payPeriod}
                </Text>
                {pieceworkLog.length > 0 ? (
                  pieceworkLog.map((entry, index) => (
                    <View
                      key={index}
                      style={tw`bg-white rounded-xl p-4 mb-4 shadow-md`}
                    >
                      <Text
                        style={tw`text-[16px] text-gray-900 font-medium mb-2`}
                      >
                        Bid Area: {entry.bidArea}
                      </Text>
                      {entry.items.map((item, itemIndex) => (
                        <View key={itemIndex} style={tw`mb-2`}>
                          <Text style={tw`text-[14px] text-gray-900`}>
                            {item.title}
                          </Text>
                          <Text style={tw`text-[14px] text-gray-600`}>
                            Quantity: {item.quantity} {item.uom}
                          </Text>
                          <Text style={tw`text-[14px] text-gray-900`}>
                            Total: ${(item.quantity * item.unitCost).toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ))
                ) : (
                  <Text style={tw`text-[16px] text-gray-500 text-center mb-6`}>
                    No items added to the log yet.
                  </Text>
                )}
                {pieceworkLog.length > 0 ? (
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
                      Submit All
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
                    onPress={() => setStage("bidArea")}
                  >
                    <LinearGradient
                      colors={["#4f46e5", "#7c3aed"]}
                      style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                    >
                      <FontAwesome name="plus" size={20} color="white" />
                    </LinearGradient>
                    <Text
                      style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                    >
                      Add Items
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={() => setStage("bidArea")}
                >
                  <LinearGradient
                    colors={["#4f46e5", "#7c3aed"]}
                    style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
                  >
                    <FontAwesome name="plus" size={20} color="white" />
                  </LinearGradient>
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold flex-1`}
                  >
                    Add More Items
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={tw`flex-row items-center bg-white rounded-full p-4 mt-4 border border-gray-200 shadow-md`}
                  onPress={handleNavigateToEmployee}
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
              {["pending", "approved", "rejected"].map((tab) => (
                <TouchableOpacity
                  key={tab}
                  style={tw`flex-1 rounded-full py-2 ${
                    historyTab === tab ? "bg-gray-100" : ""
                  }`}
                  onPress={() => setHistoryTab(tab)}
                >
                  <Text
                    style={tw`text-[16px] text-gray-900 font-semibold text-center ${
                      historyTab === tab ? "text-indigo-600" : ""
                    }`}
                  >
                    {tab.charAt(0).toUpperCase() + tab.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
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
                      {log.project?.projectName || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      Work Order:
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.workOrder?.title || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      WO Number:
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.workOrder?.woNumber || log.workOrder?._id || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>Employee:</Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {log.user?.displayName || log.user?.email || "N/A"}
                    </Text>
                  </View>
                  <View style={tw`flex-row justify-between mt-1`}>
                    <Text style={tw`text-[14px] text-gray-600`}>Status:</Text>
                    <Text
                      style={tw`text-[14px] ${
                        log.status === "approved"
                          ? "text-green-600"
                          : log.status === "rejected"
                          ? "text-red-600"
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

        {/* History Log Details */}
        {mode === "history" && selectedLog && (
          <>
            <Text
              style={tw`text-[18px] font-semibold text-gray-900 mb-6 text-center`}
            >
              Worksheet Details for{" "}
              {selectedLog.user?.displayName ||
                selectedLog.user?.email ||
                "N/A"}{" "}
              - Pay Period Ending{" "}
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
                    Quantity: {item.quantity} {item.uom}
                  </Text>
                  <Text style={tw`text-[14px] text-gray-900`}>
                    Unit Cost: ${item.unitCost.toFixed(2)} | Total: $
                    {(item.quantity * item.unitCost).toFixed(2)}
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
