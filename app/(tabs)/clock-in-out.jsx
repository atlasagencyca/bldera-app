import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  AppState,
  View,
  Animated,
  Text,
  TextInput,
  SafeAreaView,
  TouchableOpacity,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
  Platform,
  Image,
  Alert,
  ScrollView,
  FlatList,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { Button } from "react-native-paper";
import { MaterialIcons, FontAwesome, Ionicons } from "@expo/vector-icons";
import tw from "twrnc";
import { useRouter, useFocusEffect } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import * as FileSystem from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import BackgroundGeolocation from "react-native-background-geolocation";
import { FALL_DETECTION_TASK, postLocationsToServer } from "../../tasks.js";
import { Accelerometer } from "expo-sensors";
import * as TaskManager from "expo-task-manager";

// Haversine formula to calculate distance between two pxoints (in meters)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
};

export default function ClockScreen({ navigation }) {
  const { clockedIn: initialClockedIn, clockData } = useLocalSearchParams();
  const parsedClockData = clockData ? JSON.parse(clockData) : null;
  const [clockInStatus, setClockInStatus] = useState(false);
  const [clockInTime, setClockInTime] = useState(null);
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const [timesheetId, setTimesheetId] = useState(
    parsedClockData?.clockInStatus && parsedClockData?.timesheet?._id
      ? parsedClockData.timesheet._id
      : null
  );
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [galleryModalVisible, setGalleryModalVisible] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);
  const [isTaskCompleted, setIsTaskCompleted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [buttonDisabled, setButtonDisabled] = useState(false);
  const [projects, setProjects] = useState([]);
  const [isFallDetected, setIsFallDetected] = useState(false);
  const [isSelectionLocked, setIsSelectionLocked] = useState(false);
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedWorkOrder, setSelectedWorkOrder] = useState(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [selectedType, setSelectedType] = useState(null);
  const [locations, setLocations] = useState([]);
  const [inputText, setInputText] = useState("");
  const [vehiclePermission, setVehiclePermission] = useState(false);
  const [usePersonalVehicle, setUsePersonalVehicle] = useState(false);
  const [isProjectDropdownOpen, setIsProjectDropdownOpen] = useState(false);
  const [isWorkOrderDropdownOpen, setIsWorkOrderDropdownOpen] = useState(false);
  const [editingIndex, setEditingIndex] = useState(null);
  const [selectedImages, setSelectedImages] = useState([]);
  const [receiptImages, setReceiptImages] = useState([]);
  const [receiptCount, setReceiptCount] = useState(0);
  const [imageCount, setImageCount] = useState(0);
  const [taskCompletionModalVisible, setTaskCompletionModalVisible] =
    useState(false);
  const [userId, setUserId] = useState(null);
  const [userGeoFence, setUserGeoFence] = useState(false);
  const [isPaid, setIsPaid] = useState(false); // New state for paid status
  const cameraRef = useRef(null);
  const [facing, setFacing] = useState("back");

  const toggleAnim = useRef(
    new Animated.Value(usePersonalVehicle ? 1 : 0)
  ).current;

  const toggleSwitch = () => {
    Animated.timing(toggleAnim, {
      toValue: usePersonalVehicle ? 0 : 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
    setUsePersonalVehicle(!usePersonalVehicle);
  };

  useEffect(() => {
    const loadNotes = async () => {
      try {
        const savedNotes = await AsyncStorage.getItem("savedNotes");
        if (savedNotes) setInputText(savedNotes);
      } catch (error) {
        console.error("Failed to load notes:", error);
      }
    };
    loadNotes();
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      if (status !== "granted" && isPaid) {
        // Only request if paid
        const { status: newStatus } =
          await ImagePicker.requestCameraPermissionsAsync();
        if (newStatus === "granted") requestPermission();
      }
    };
    checkPermissions();
  }, [isPaid]);

  useEffect(() => {
    const checkFallDetectionStatus = async () => {
      try {
        const storedFallDetected = await AsyncStorage.getItem("isFallDetected");
        setIsFallDetected(
          storedFallDetected ? JSON.parse(storedFallDetected) : false
        );
      } catch (error) {
        console.error("Error polling fall detection status:", error);
      }
    };

    // Initial check
    checkFallDetectionStatus();

    // Poll every 5 seconds when clocked in and paid
    let intervalId;
    if (clockInStatus && isPaid) {
      intervalId = setInterval(checkFallDetectionStatus, 5000); // 5000ms = 5 seconds
    }

    // Cleanup interval on unmount or when clockInStatus/isPaid changes
    return () => {
      if (intervalId) clearInterval(intervalId);
    };
  }, [clockInStatus, isPaid]); // Re-run effect when clockInStatus or isPaid changes

  const loadSelections = useCallback(async () => {
    try {
      const storedProject = await AsyncStorage.getItem("selectedProject");
      const storedWorkOrder = await AsyncStorage.getItem("selectedWorkOrder");
      if (storedProject) setSelectedProject(JSON.parse(storedProject));
      if (storedWorkOrder) setSelectedWorkOrder(JSON.parse(storedWorkOrder));
    } catch (error) {
      console.error("Failed to load selections:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSelections();
    }, [loadSelections])
  );

  useFocusEffect(
    useCallback(() => {
      return () => {
        AsyncStorage.setItem("lastTab", "clock-in-out");
      };
    }, [])
  );

  useEffect(() => {
    const manageBackgroundGeolocation = async () => {
      try {
        // Check stored clock-in status
        const storedClockInStatus = await AsyncStorage.getItem("clockInStatus");
        const isClockedIn = storedClockInStatus === "true";
        console.log("Clock-in status from storage:", isClockedIn);

        // If not clocked in, ensure BackgroundGeolocation is stopped
        if (!isClockedIn || !isPaid) {
          console.log(
            "User not clocked in or not paid, stopping BackgroundGeolocation"
          );
          await BackgroundGeolocation.stop();
          console.log("BackgroundGeolocation stopped");
          return;
        }

        // If clocked in and paid, configure and start BackgroundGeolocation
        console.log("User clocked in and paid, starting BackgroundGeolocation");
        await configureBackgroundGeolocation();
        await BackgroundGeolocation.start();
        console.log("BackgroundGeolocation started");
      } catch (error) {
        console.error("Error managing BackgroundGeolocation:", error.message);
        // Stop BackgroundGeolocation on error to be safe
        await BackgroundGeolocation.stop();
      }
    };

    // Run the management function
    manageBackgroundGeolocation();

    // Cleanup: Ensure BackgroundGeolocation is stopped when component unmounts
    return () => {
      console.log("Cleaning up: Stopping BackgroundGeolocation on unmount");
      BackgroundGeolocation.stop();
    };
  }, [clockInStatus, isPaid]); // Dependencies: re-run when clockInStatus or isPaid changes

  const syncTimesheetUpdates = async () => {
    try {
      const storedClockInStatus = await AsyncStorage.getItem("clockInStatus");
      const isClockedIn = storedClockInStatus === "true";
      if (!isClockedIn) {
        console.log("Not clocked in, skipping sync");
        return;
      }

      const storedLocations = await AsyncStorage.getItem("locations");
      const locationsArray = storedLocations ? JSON.parse(storedLocations) : [];
      if (locationsArray.length === 0) {
        console.log("No new locations to sync");
        return;
      }

      const netInfo = await NetInfo.fetch();
      if (!netInfo.isConnected) {
        console.log("Offline: Locations stored locally, will sync later");
        return;
      }

      console.log("Syncing locations to server:", locationsArray.length);
      await postLocationsToServer(locationsArray);

      // Clear only after successful sync to avoid losing data
      await AsyncStorage.setItem("locations", JSON.stringify([]));
      setLocations([]); // Reset state after successful sync
    } catch (error) {
      console.error("Error in syncTimesheetUpdates:", error.message);
    }
  };

  useEffect(() => {
    console.log(
      "Sync useEffect - clockInStatus:",
      clockInStatus,
      "isPaid:",
      isPaid
    );
    let syncInterval;
    if (clockInStatus && isPaid) {
      console.log("Starting sync interval");
      syncInterval = setInterval(syncTimesheetUpdates, 30000);
    }
    return () => syncInterval && clearInterval(syncInterval);
  }, [clockInStatus, isPaid]);

  useEffect(() => {
    const initializeClockScreen = async () => {
      try {
        setLoading(true);

        const storedUserId = await SecureStore.getItemAsync("userId");
        if (!storedUserId) throw new Error("User ID not found");
        setUserId(storedUserId);

        const token = await SecureStore.getItemAsync("authToken");
        if (!token) throw new Error("Auth token not found");

        const userEmail = await SecureStore.getItemAsync("userEmail");
        if (!userEmail) throw new Error("User email not found");

        const netInfo = await NetInfo.fetch();
        if (netInfo.isConnected) {
          // Fetch projects
          const projectsResponse = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects/hourly",
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (!projectsResponse.ok) throw new Error("Failed to fetch projects");
          const data = await projectsResponse.json();
          const projectsWithRequiredFields = data.map((project) => ({
            _id: project._id,
            projectName: project.projectName,
            workOrders: project.workOrders,
            address: project.address,
          }));
          setProjects(projectsWithRequiredFields);
          await SecureStore.setItemAsync(
            "projects",
            JSON.stringify(projectsWithRequiredFields)
          );

          // Fetch user data
          const userResponse = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/email",
            {
              method: "GET",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
            }
          );
          if (!userResponse.ok) throw new Error("Failed to fetch user data");
          const userData = await userResponse.json();
          if (!userData.success || !userData.user)
            throw new Error("User not found");

          const { isPaid, geoFence } = userData.user;
          setIsPaid(isPaid || false);
          setUserGeoFence(geoFence || false);
          await SecureStore.setItemAsync(
            "isPaid",
            JSON.stringify(isPaid || false)
          );
          await SecureStore.setItemAsync(
            "geoFence",
            JSON.stringify(geoFence || false)
          );
        } else {
          // Offline mode
          const storedProjects = await SecureStore.getItemAsync("projects");
          if (storedProjects) setProjects(JSON.parse(storedProjects));
          const storedIsPaid = await SecureStore.getItemAsync("isPaid");
          if (storedIsPaid) setIsPaid(JSON.parse(storedIsPaid));
          const storedGeoFence = await SecureStore.getItemAsync("geoFence");
          if (storedGeoFence) setUserGeoFence(JSON.parse(storedGeoFence));
        }

        await checkClockInStatus(); // Rely on this for clockInStatus
        if (isPaid) await configureBackgroundGeolocation();

        setLoading(false);
      } catch (error) {
        console.error("Initialization error:", error.message);
        setClockInStatus(false);
        setIsPaid(false);
        setUserGeoFence(false);
        setLoading(false);
      }
    };
    initializeClockScreen();
  }, []);
  const addNote = () => {
    if (newNote.trim()) {
      const updatedNotes = inputText.trim()
        ? `${inputText.trim()}\n${newNote.trim()}`
        : newNote.trim();
      setInputText(updatedNotes);
      saveNotes(updatedNotes);
      setNewNote("");
      setModalVisible(false);
    }
  };

  const configureBackgroundGeolocation = async () => {
    if (!isPaid) return;
    try {
      await BackgroundGeolocation.ready({
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: 50,
        stopTimeout: 60,
        debug: false,
        logLevel: BackgroundGeolocation.LOG_LEVEL_OFF,
        stopOnTerminate: false,
        startOnBoot: true,
        foregroundService: true,
        notification: {
          title: "Location Tracking Enabled",
          text: "Monitoring your location for safety and timesheet updates.",
          color: "#FF0000",
          priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_HIGH,
          enabled: true,
        },
        motionActivity: true,
      });

      BackgroundGeolocation.onLocation(
        async (location) => {
          const storedClockInStatus = await AsyncStorage.getItem(
            "clockInStatus"
          );
          if (storedClockInStatus !== "true") return;

          // Create a new location object to append
          const newLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: location.timestamp,
          };

          // Append to locations state immutably
          setLocations((prevLocations) => [...prevLocations, newLocation]);

          // Optionally store in AsyncStorage for persistence
          const storedLocations = await AsyncStorage.getItem("locations");
          const locationsArray = storedLocations
            ? JSON.parse(storedLocations)
            : [];
          const updatedLocations = [...locationsArray, newLocation];
          await AsyncStorage.setItem(
            "locations",
            JSON.stringify(updatedLocations)
          );

          const netInfo = await NetInfo.fetch();
          if (netInfo.isConnected) {
            // Post a single location update, not the entire array
            await postLocationsToServer([newLocation]); // Send only the new location
          }
        },
        (error) => {
          console.error("Location error:", error.message);
        }
      );

      console.log("BackgroundGeolocation configured");
    } catch (error) {
      console.error("Error configuring BackgroundGeolocation:", error.message);
    }
  };

  const getLocalTimeISOString = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const isoString = now.toISOString().replace(/\.\d{3}Z$/, "");
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return {
      time: isoString,
      timezone: timezone,
      offset: offset / 60,
    };
  };

  useEffect(() => {
    const handleAppStateChange = async (nextAppState) => {
      if (nextAppState === "inactive" || nextAppState === "background") {
        await AsyncStorage.setItem(
          "storedImages",
          JSON.stringify(selectedImages)
        );
        await AsyncStorage.setItem(
          "storedReceipts",
          JSON.stringify(receiptImages)
        );
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );
    return () => subscription.remove();
  }, [selectedImages, receiptImages]);

  useEffect(() => {
    const loadStoredData = async () => {
      try {
        const storedImages = await AsyncStorage.getItem("storedImages");
        const storedReceipts = await AsyncStorage.getItem("storedReceipts");

        if (storedImages) {
          const parsedImages = JSON.parse(storedImages);
          setSelectedImages(parsedImages);
          setImageCount(parsedImages.length);
        }

        if (storedReceipts) {
          const parsedReceipts = JSON.parse(storedReceipts);
          setReceiptImages(parsedReceipts);
          setReceiptCount(parsedReceipts.length);
        }
      } catch (error) {
        console.error("Failed to load stored data", error);
      }
    };

    loadStoredData();
  }, []);

  const toggleCameraFacing = () => {
    setFacing((current) => (current === "back" ? "front" : "back"));
  };

  const removeImage = (index) => {
    const updatedImages = [...selectedImages];
    updatedImages.splice(index, 1);
    setSelectedImages(updatedImages);
    setImageCount(updatedImages.length);
    AsyncStorage.setItem("storedImages", JSON.stringify(updatedImages));
  };

  const removeReceipt = (index) => {
    const updatedReceipts = [...receiptImages];
    updatedReceipts.splice(index, 1);
    setReceiptImages(updatedReceipts);
    setReceiptCount(updatedReceipts.length);
    AsyncStorage.setItem("storedReceipts", JSON.stringify(updatedReceipts));
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        const userEmail = await SecureStore.getItemAsync("userEmail");
        if (!userEmail) {
          console.error("User email not found in SecureStore.");
          return;
        }

        const storedValue = await SecureStore.getItemAsync("vehiclePermission");
        if (storedValue) {
          setVehiclePermission(JSON.parse(storedValue));
        }
      } catch (error) {
        console.error("Error in initializeData:", error);
      }
    };

    initializeData();
  }, []);

  useEffect(() => {
    let timer;
    if (clockInStatus && clockInTime) {
      const startTime = new Date(clockInTime).getTime();
      if (isNaN(startTime)) {
        console.error("Invalid clockInTime:", clockInTime);
        return;
      }

      const updateElapsed = async () => {
        const storedClockInData = await AsyncStorage.getItem("clockInData");
        const clockInData = storedClockInData
          ? JSON.parse(storedClockInData)
          : { timezoneOffset: 4 };
        const timezoneOffset = clockInData.timezoneOffset || 0;

        const now = Date.now();
        const elapsedTime = Math.floor((now - startTime) / 1000);

        setElapsed(elapsedTime > 0 ? elapsedTime : 0);
      };

      updateElapsed();
      timer = setInterval(() => updateElapsed(), 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [clockInStatus, clockInTime]);

  const uploadImages = async (timesheetId, imagesArray, route) => {
    if (imagesArray.length === 0) {
      console.log("No images to upload.");
      return;
    }

    try {
      const token = await SecureStore.getItemAsync("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const formData = new FormData();
      for (const [index, image] of imagesArray.entries()) {
        console.log(`Processing image ${index}:`, image.uri);
        const fileInfo = await FileSystem.getInfoAsync(image.uri);
        if (!fileInfo.exists) {
          throw new Error(`File at ${image.uri} does not exist`);
        }
        console.log("File info:", fileInfo);

        formData.append("images", {
          uri: image.uri,
          name: `image_${index}.jpg`,
          type: "image/jpeg",
        });
      }

      const imageUploadResponse = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/${timesheetId}/${route}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "multipart/form-data",
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        }
      );

      const responseText = await imageUploadResponse.text();
      console.log("Server response:", responseText);

      if (imageUploadResponse.ok) {
        console.log("Images uploaded successfully.");
      } else {
        throw new Error(
          `Image upload failed: ${imageUploadResponse.status} - ${responseText}`
        );
      }
    } catch (error) {
      console.error("Error uploading images:", error.message);
    }
  };

  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const checkClockInStatus = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");
      if (!userId || !token) {
        console.log("Missing userId or token, setting clockInStatus to false");
        setClockInStatus(false);
        return;
      }

      const netInfo = await NetInfo.fetch();
      let timesheet = null;

      if (netInfo.isConnected) {
        console.log("Online: Fetching current timesheet");
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
        if (response.ok) {
          const data = await response.json();
          console.log("Server response:", data);
          if (data.isClockedIn && data.timesheet) {
            timesheet = data.timesheet;
          } else {
            console.log("No active timesheet, setting clockInStatus to false");
            setClockInStatus(false);
            await AsyncStorage.setItem("clockInStatus", JSON.stringify(false));
            await AsyncStorage.removeItem("clockInData");
            await AsyncStorage.removeItem("clockInTime");
            await AsyncStorage.removeItem("timesheetId");
            return;
          }
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
      } else {
        console.log("Offline: Checking stored clockInData");
        const storedClockInData = await AsyncStorage.getItem("clockInData");
        if (storedClockInData) {
          const clockInData = JSON.parse(storedClockInData);
          console.log("Stored clockInData:", clockInData);
          if (clockInData.start && clockInData.timesheetId) {
            timesheet = {
              _id: clockInData.timesheetId,
              start: clockInData.start,
              projectName: clockInData.projectName,
              woNumber: clockInData.workOrderId,
              title: clockInData.title || "N/A",
              usePersonalVehicle: clockInData.usePersonalVehicle || false,
            };
          } else {
            console.log("Invalid clockInData, no timesheet set");
          }
        }
      }

      if (timesheet) {
        console.log("Timesheet found, setting clockInStatus to true");
        setClockInStatus(true);
        setSelectedProject({
          projectName: timesheet.projectName || "Unknown Project",
        });
        setSelectedWorkOrder({
          woNumber: timesheet.woNumber || "Unknown WO",
          title: timesheet.title || "N/A",
        });
        setTimesheetId(timesheet._id);
        setClockInTime(timesheet.start);
        setUsePersonalVehicle(timesheet.usePersonalVehicle || false);

        const clockInData = {
          start: timesheet.start,
          timesheetId: timesheet._id,
          projectName: timesheet.projectName,
          workOrderId: timesheet.woNumber,
          title: timesheet.title || "N/A",
          usePersonalVehicle: timesheet.usePersonalVehicle || false,
          timezone: timesheet.timezone || "America/Toronto",
          timezoneOffset: timesheet.timezoneOffset || 4,
          isOnline: netInfo.isConnected,
        };
        await AsyncStorage.setItem("clockInData", JSON.stringify(clockInData));
        await AsyncStorage.setItem("clockInStatus", JSON.stringify(true));
        if (netInfo.isConnected && isPaid) {
          console.log("Starting BackgroundGeolocation");
          BackgroundGeolocation.start();
        }
      } else {
        console.log("No timesheet, setting clockInStatus to false");
        setClockInStatus(false);
        await AsyncStorage.setItem("clockInStatus", JSON.stringify(false));
      }
    } catch (err) {
      console.error("Error checking clock-in status:", err.message);
      setClockInStatus(false);
      await AsyncStorage.setItem("clockInStatus", JSON.stringify(false));
    }
  };

  const clearNotesAfterLockout = async () => {
    try {
      await AsyncStorage.removeItem("savedNotes");
      console.log("Notes cleared after lockout.");
    } catch (error) {
      console.error("Failed to clear notes:", error);
    }
  };

  const handleClockIn = async () => {
    if (!isPaid) {
      Alert.alert(
        "Subscription Required",
        "You need to be part of a company subscription to clock in and use related features."
      );
      return;
    }

    if (!selectedProject || !selectedWorkOrder) {
      Alert.alert(
        "Selection Required",
        "Please select a project and work order before clocking in."
      );
      return;
    }

    try {
      setButtonDisabled(true);

      const { status: notificationStatus } =
        await Notifications.requestPermissionsAsync();
      if (notificationStatus !== "granted") {
        alert("Permission to access notifications was denied");
        setErrorMsg("Permission to access notifications was denied");
        setButtonDisabled(false);
        return;
      }

      await configureBackgroundGeolocation();

      const location = await BackgroundGeolocation.getCurrentPosition({
        timeout: 30, // 30 second timeout to fetch location
        persist: true, // Defaults to state.enabled
        maximumAge: 1000, // Accept the last-known-location if not older than 5000 ms.
        desiredAccuracy: 10, // Try to fetch a location with an accuracy of `10` meters.
        samples: 3, // How many location samples to attempt.
      });
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;

      if (userGeoFence) {
        const projectLat = selectedProject.address.latitude;
        const projectLon = selectedProject.address.longitude;

        if (!projectLat || !projectLon) {
          Alert.alert(
            "Error",
            "Project location data is missing. Cannot verify geofence."
          );
          setButtonDisabled(false);
          return;
        }

        const distance = calculateDistance(
          userLat,
          userLon,
          projectLat,
          projectLon
        );
        console.log(`Distance to project: ${distance} meters`);

        if (distance > 500) {
          Alert.alert(
            "Geofence Error",
            "You must be within 500 meters of the project location to clock in."
          );
          setButtonDisabled(false);
          return;
        }
      }
      await AsyncStorage.setItem("locations", JSON.stringify([]));
      const newLocation = {
        latitude: userLat,
        longitude: userLon,
        timestamp: new Date().toISOString(),
      };

      setLocations([newLocation]);

      const now = new Date();
      const localTimeString = now.toISOString().replace(/\.\d{3}Z$/, ".000Z");
      const timeData = getLocalTimeISOString();

      setClockInTime(localTimeString);
      await AsyncStorage.setItem("clockInTime", localTimeString);
      setElapsed(0);

      const userEmail = await SecureStore.getItemAsync("userEmail");

      const clockInData = {
        projectId: selectedProject._id,
        workOrderId: selectedWorkOrder._id,
        start: localTimeString,
        email: userEmail,
        userId: userId,
        timezone: timeData.timezone,
        timezoneOffset: timeData.offset,
        locations: [newLocation],
        usePersonalVehicle: Boolean(usePersonalVehicle),
        isOnline: true,
      };

      await AsyncStorage.removeItem("savedNotes");
      setInputText("");

      const netInfo = await NetInfo.fetch();

      if (netInfo.isConnected) {
        try {
          const token = await SecureStore.getItemAsync("authToken");
          const response = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/clock-in",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-User-ID": userId,
              },
              body: JSON.stringify(clockInData),
            }
          );

          if (response.ok) {
            const responseData = await response.json();

            const timesheetId = responseData.timesheetId;

            await AsyncStorage.setItem("timesheetId", timesheetId);
            await AsyncStorage.setItem("clockInStatus", JSON.stringify(true));
            await AsyncStorage.setItem("isFallDetected", JSON.stringify(false));

            clockInData.timesheetId = timesheetId;
            await AsyncStorage.setItem(
              "clockInData",
              JSON.stringify(clockInData)
            );

            setClockInStatus(true);
            setIsSelectionLocked(true);
            setIsFallDetected(false); // Reset state

            // Start BackgroundGeolocation
            BackgroundGeolocation.start();
            console.log("BackgroundGeolocation started");

            const { status: accelStatus } =
              await Accelerometer.requestPermissionsAsync();
            if (accelStatus !== "granted") {
              console.log("Accelerometer permission denied");
              Alert.alert(
                "Permission Denied",
                "Accelerometer access is required for fall detection."
              );
            } else {
              if (!TaskManager.isTaskRegistered(FALL_DETECTION_TASK)) {
                await TaskManager.registerTaskAsync(FALL_DETECTION_TASK);
                console.log(`${FALL_DETECTION_TASK} registered`);
              }
              Accelerometer.setUpdateInterval(500);
              Accelerometer.addListener((data) => {
                TaskManager.dispatchTask(FALL_DETECTION_TASK, data);
              });
              console.log("Fall detection started");
            }

            setButtonDisabled(false);
          } else {
            setButtonDisabled(false);
            throw new Error("Failed to post clock-in data");
          }
        } catch (error) {
          console.error("Error posting clock-in data:", error);
          setButtonDisabled(false);
        }
      } else {
        clockInData.isOnline = false;

        await AsyncStorage.setItem("clockInData", JSON.stringify(clockInData));
        await AsyncStorage.setItem("clockInStatus", JSON.stringify(true));
        await AsyncStorage.setItem("isFallDetected", JSON.stringify(false));
        setClockInStatus(true);
        setIsSelectionLocked(true);
        setIsFallDetected(false); // Reset state

        BackgroundGeolocation.start();
        console.log("BackgroundGeolocation started (offline)");

        const { status: accelStatus } =
          await Accelerometer.requestPermissionsAsync();
        if (accelStatus === "granted") {
          if (!TaskManager.isTaskRegistered(FALL_DETECTION_TASK)) {
            await TaskManager.registerTaskAsync(FALL_DETECTION_TASK);
            console.log(`${FALL_DETECTION_TASK} registered (offline)`);
          }
          Accelerometer.setUpdateInterval(500);
          Accelerometer.addListener((data) => {
            TaskManager.dispatchTask(FALL_DETECTION_TASK, data);
          });
          console.log("Fall detection started (offline)");
        }

        Alert.alert(
          "Offline",
          "You are offline. Your clock-in data will be synced when you clock out."
        );
        setButtonDisabled(false);
      }
    } catch (error) {
      console.error("Error during clock-in:", error);
      BackgroundGeolocation.stop();
      setButtonDisabled(false);
    }
  };

  const finalizeClockOut = async () => {
    setButtonDisabled(true);
    setIsSelectionLocked(true);

    // if (!inputText.trim()) {
    //   Alert.alert(
    //     "Input Required",
    //     "Please enter a note describing the work completed before clocking out."
    //   );
    //   setButtonDisabled(false);
    //   setIsSelectionLocked(false);
    //   return;
    // }

    await loadDetails();

    const clockInData = JSON.parse(await AsyncStorage.getItem("clockInData"));
    if (!clockInData) {
      console.error("No clockInData found for clock-out");
      setButtonDisabled(false);
      setIsSelectionLocked(false);
      return;
    }

    const now = new Date();
    const clockOutTime = now.toISOString().replace(/\.\d{3}Z$/, ".000Z");
    console.log("Clocking out at local time:", clockOutTime);

    const userEmail = await SecureStore.getItemAsync("userEmail");
    const storedLocations = await AsyncStorage.getItem("locations");
    const locationData = storedLocations ? JSON.parse(storedLocations) : [];

    const offlineId = `offline-${Date.now()}`;
    const timeData = getLocalTimeISOString();

    const clockOutPayload = {
      timesheetId: clockInData.timesheetId,
      end: clockOutTime,
      clockInStatus: false,
      email: userEmail,
      user: userId,
      timezone: timeData.timezone,
      timezoneOffset: clockInData.timezoneOffset || timeData.offset,
      locations: [...locationData],
      workOrderDescription: inputText,
    };

    try {
      const netInfo = await NetInfo.fetch();
      console.log("Clocking out...");

      const fullPayload = {
        ...clockInData,
        end: clockOutTime,
        clockInStatus: false,
        email: userEmail,
        user: userId,
        offlineId,
        locations: [...locationData],
        workOrderDescription: inputText,
      };

      if (!netInfo.isConnected) {
        const offlineTimesheets =
          JSON.parse(await AsyncStorage.getItem("offlineTimesheets")) || [];
        const offlineImages =
          JSON.parse(await AsyncStorage.getItem("offlineImages")) || [];
        const offlineReceipts =
          JSON.parse(await AsyncStorage.getItem("offlineReceipts")) || [];

        offlineTimesheets.push(fullPayload);
        await AsyncStorage.setItem(
          "offlineTimesheets",
          JSON.stringify(offlineTimesheets)
        );

        const imagesToUpload = selectedImages.map((image) => ({
          uri: image.uri,
          offlineId,
        }));
        offlineImages.push(...imagesToUpload);
        await AsyncStorage.setItem(
          "offlineImages",
          JSON.stringify(offlineImages)
        );

        const receiptsToUpload = receiptImages.map((image) => ({
          uri: image.uri,
          offlineId,
        }));
        offlineReceipts.push(...receiptsToUpload);
        await AsyncStorage.setItem(
          "offlineReceipts",
          JSON.stringify(offlinereceipts)
        );

        Alert.alert(
          "Offline",
          "You are offline. Your timesheet and images will be synced when you are online."
        );
      } else {
        const token = await SecureStore.getItemAsync("authToken");
        let response;

        if (clockInData.isOnline) {
          response = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/clock-out",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-User-ID": userId,
              },
              body: JSON.stringify({
                user: userId,
                end: clockOutTime,
                timezone: timeData.timezone,
                timezoneOffset: clockInData.timezoneOffset || timeData.offset,
                workOrderDescription: inputText,
              }),
            }
          );
        } else {
          response = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/clockOutOffline",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "X-User-ID": userId,
              },
              body: JSON.stringify(clockOutPayload),
            }
          );
        }

        if (response.ok) {
          if (selectedImages.length > 0 || receiptImages.length > 0) {
            await delay(50);
            await uploadImages(
              clockInData.timesheetId,
              selectedImages,
              "upload-images"
            );
            await uploadImages(
              clockInData.timesheetId,
              receiptImages,
              "upload-receipts"
            );
          }
          console.log("Clock-out successful");
        } else {
          throw new Error(`Failed to clock out: ${response.statusText}`);
        }
      }

      await AsyncStorage.setItem("clockInStatus", "false");
      await AsyncStorage.removeItem("clockInTime");
      await AsyncStorage.removeItem("timesheetId");
      await AsyncStorage.setItem("locations", JSON.stringify([]));
      await AsyncStorage.removeItem("clockInData");
      await AsyncStorage.removeItem("selectedProject");
      await AsyncStorage.removeItem("selectedWorkOrder");

      await AsyncStorage.removeItem("storedImages");
      setSelectedImages([]);
      setImageCount(0);

      await AsyncStorage.removeItem("storedReceipts");
      setReceiptImages([]);
      setReceiptCount(0);

      await clearNotesAfterLockout();

      setModalVisible(false);
      setClockInStatus(false);
      setClockInTime(null);
      setElapsed(0);
      setButtonDisabled(false);
      setInputText("");
      setIsSelectionLocked(false);

      Accelerometer.removeAllListeners();
      if (TaskManager.isTaskRegistered(FALL_DETECTION_TASK)) {
        await TaskManager.unregisterTaskAsync(FALL_DETECTION_TASK);
        console.log(`${FALL_DETECTION_TASK} unregistered on clock-out`);
      }

      BackgroundGeolocation.stop();
      console.log("BackgroundGeolocation stopped after clock-out");

      await AsyncStorage.setItem("isFallDetected", JSON.stringify(false));
      setIsFallDetected(false);

      console.log("Clock-out completed");
    } catch (error) {
      console.error("Error during clock-out:", error);
      setButtonDisabled(false);
      setIsSelectionLocked(false);
    }
  };

  const saveDetails = async () => {
    try {
      await AsyncStorage.multiSet([
        ["clockInStatus", JSON.stringify(clockInStatus)],
        ["clockInTime", JSON.stringify(clockInTime)],
      ]);
      console.log("Details saved");
    } catch (error) {
      console.error("Failed to save data to storage", error);
    }
  };

  const loadDetails = async () => {
    try {
      const project = await AsyncStorage.getItem("selectedProject");
      const workOrder = await AsyncStorage.getItem("selectedWorkOrder");
      setSelectedProject(project ? JSON.parse(project) : null);
      setSelectedWorkOrder(workOrder ? JSON.parse(workOrder) : null);
    } catch (error) {
      console.error("Failed to load data from storage", error);
    }
  };

  const openCameraModal = (type) => {
    if (!isPaid) {
      Alert.alert(
        "Subscription Required",
        "You need to be part of a company subscription to use the camera features."
      );
      return;
    }
    setSelectedType(type);
    setCameraModalVisible(true);
  };

  const handleCapturePhoto = async () => {
    if (!isPaid) return; // Shouldn't reach here due to openCameraModal check, but added for safety

    if (!permission?.granted) {
      const { status } = await Camera.requestCameraPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Camera access is needed to take photos."
        );
        return;
      }
      requestPermission();
    }

    try {
      if (cameraRef.current) {
        const availableSizes =
          await cameraRef.current.getAvailablePictureSizesAsync();
        console.log("Available picture sizes:", availableSizes);

        let pictureSize = availableSizes.find((size) => {
          const [width, height] = size.split("x").map(Number);
          const aspectRatio = width / height;
          return Math.abs(aspectRatio - 4 / 3) < 0.05;
        });

        if (!pictureSize) {
          console.warn(
            "No 4:3 aspect ratio found. Falling back to highest available."
          );
          pictureSize = availableSizes.reduce((max, size) => {
            const [width, height] = size.split("x").map(Number);
            const maxArea = max
              .split("x")
              .map(Number)
              .reduce((a, b) => a * b, 1);
            const currentArea = width * height;
            return currentArea > maxArea ? size : max;
          }, availableSizes[0]);
        }

        console.log("Selected picture size:", pictureSize);

        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5,
          base64: false,
          pictureSize,
        });

        console.log(
          "Captured photo resolution:",
          photo.width,
          "x",
          photo.height
        );

        const newPhoto = { uri: photo.uri };

        if (selectedType === "image") {
          const updatedImages = [...selectedImages, newPhoto];
          setSelectedImages(updatedImages);
          setImageCount(updatedImages.length);
          await AsyncStorage.setItem(
            "storedImages",
            JSON.stringify(updatedImages)
          );
          console.log("Updated Images:", updatedImages.length);
        } else if (selectedType === "receipt") {
          const updatedReceipts = [...receiptImages, newPhoto];
          setReceiptImages(updatedReceipts);
          setReceiptCount(updatedReceipts.length);
          await AsyncStorage.setItem(
            "storedReceipts",
            JSON.stringify(updatedReceipts)
          );
          console.log("Updated Receipts:", updatedReceipts.length);
        }

        setCameraModalVisible(false);
      }
    } catch (error) {
      console.error("Error capturing photo:", error);
      Alert.alert("Error", "Failed to capture photo. Please try again.");
    }
  };

  const handleSelectFromLibrary = async () => {
    if (!isPaid) {
      Alert.alert(
        "Subscription Required",
        "You need to be part of a company subscription to use the gallery features."
      );
      return;
    }

    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Gallery access is needed to select photos."
        );
        console.log("Permission denied");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsMultipleSelection: true,
        quality: 1,
        presentationStyle: "popover",
      });

      if (result.canceled) {
        console.log("User canceled image selection");
        return;
      }

      if (!result.assets || result.assets.length === 0) {
        console.log("No images selected");
        return;
      }

      const newImages = result.assets.map((asset) => ({ uri: asset.uri }));

      if (selectedType === "image") {
        const updatedImages = [...selectedImages, ...newImages];
        setSelectedImages(updatedImages);
        setImageCount(updatedImages.length);
        console.log("Images added:", updatedImages.length);
        await AsyncStorage.setItem(
          "storedImages",
          JSON.stringify(updatedImages)
        );
      } else if (selectedType === "receipt") {
        const updatedReceipts = [...receiptImages, ...newImages];
        setReceiptImages(updatedReceipts);
        setReceiptCount(updatedReceipts.length);
        console.log("Receipts added:", updatedReceipts.length);
        await AsyncStorage.setItem(
          "storedReceipts",
          JSON.stringify(updatedReceipts)
        );
      }
    } catch (error) {
      console.error("Error selecting from gallery:", error);
    }
  };

  const openAddNoteModal = () => {
    setNewNote("");
    setEditingIndex(null);
    setModalVisible(true);
  };

  const openEditNoteModal = (note, index) => {
    setNewNote(note);
    setEditingIndex(index);
    setModalVisible(true);
  };

  const saveNotes = async (notes) => {
    try {
      await AsyncStorage.setItem("savedNotes", notes);
    } catch (error) {
      console.error("Failed to save notes:", error);
    }
  };

  const editNote = () => {
    if (editingIndex !== null && newNote.trim()) {
      let notesArray = inputText.split("\n").map((note) => note.trim());
      notesArray[editingIndex] = newNote.trim();
      const updatedNotes = notesArray.join("\n");
      setInputText(updatedNotes);
      saveNotes(updatedNotes);
      setModalVisible(false);
    }
  };

  const saveNote = () => {
    if (editingIndex !== null) {
      editNote();
    } else {
      addNote();
    }
  };

  return (
    <>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="transparent"
        translucent={true}
      />
      <SafeAreaView style={tw`flex-1 bg-gray-100 pt-0`}>
        {loading ? (
          <View style={tw`flex-1 justify-center items-center`}>
            <ActivityIndicator size="large" color="#00CC66" />
          </View>
        ) : (
          <>
            <ScrollView contentContainerStyle={tw`px-5 pb-5 flex-grow`}>
              <View style={tw`bg-white shadow-md rounded-xl p-4 mx-2 mt-4`}>
                <Text
                  style={tw`text-[18px] font-semibold text-gray-900 text-center`}
                >
                  {selectedProject
                    ? selectedProject.projectName
                    : "No Project Selected"}
                </Text>
                <Text
                  style={tw`text-[16px] font-medium text-gray-700 mt-1 text-center`}
                >
                  WO#{" "}
                  {selectedWorkOrder
                    ? selectedWorkOrder.woNumber
                    : "No Work Order Selected"}{" "}
                  - {selectedWorkOrder ? selectedWorkOrder.title : "Empty"}
                </Text>
              </View>

              {!clockInStatus && (
                <>
                  <View style={tw`mx-2 mt-6`}>
                    <TouchableOpacity
                      style={tw`bg-gray-100 p-3 rounded-lg flex-row justify-between items-center border border-gray-300 shadow-md`}
                      onPress={() => setIsProjectDropdownOpen((prev) => !prev)}
                    >
                      <Text style={tw`text-[16px] text-gray-900 font-semibold`}>
                        {selectedProject
                          ? selectedProject.projectName
                          : "Select Project"}
                      </Text>
                      <FontAwesome
                        name={
                          isProjectDropdownOpen ? "chevron-up" : "chevron-down"
                        }
                        size={16}
                        color="#999"
                      />
                    </TouchableOpacity>
                    {isProjectDropdownOpen && (
                      <View
                        style={tw`bg-white border border-gray-300 rounded-lg mt-1 shadow-md max-h-40`}
                      >
                        <ScrollView nestedScrollEnabled>
                          {projects.map((project) => (
                            <TouchableOpacity
                              key={project._id}
                              style={tw`p-3 border-b border-gray-200`}
                              onPress={() => {
                                setSelectedProject(project);
                                setSelectedWorkOrder(null);
                                setIsProjectDropdownOpen(false);
                              }}
                            >
                              <Text style={tw`text-[16px] text-gray-900`}>
                                {project.projectName}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      </View>
                    )}
                  </View>

                  {selectedProject && (
                    <View style={tw`mx-2 mt-6`}>
                      <TouchableOpacity
                        style={tw`bg-gray-100 p-3 rounded-lg flex-row justify-between items-center border border-gray-300 shadow-md`}
                        onPress={() =>
                          setIsWorkOrderDropdownOpen((prev) => !prev)
                        }
                      >
                        <Text
                          style={tw`text-[16px] text-gray-900 font-semibold`}
                        >
                          {selectedWorkOrder
                            ? `${selectedWorkOrder.woNumber} - ${selectedWorkOrder.title}`
                            : "Select Work Order"}
                        </Text>
                        <FontAwesome
                          name={
                            isWorkOrderDropdownOpen
                              ? "chevron-up"
                              : "chevron-down"
                          }
                          size={16}
                          color="#999"
                        />
                      </TouchableOpacity>
                      {isWorkOrderDropdownOpen && (
                        <View
                          style={tw`bg-white border border-gray-300 rounded-lg mt-1 shadow-md max-h-40`}
                        >
                          <ScrollView nestedScrollEnabled>
                            {selectedProject.workOrders?.map((workOrder) => (
                              <TouchableOpacity
                                key={workOrder._id}
                                style={tw`p-3 border-b border-gray-200`}
                                onPress={() => {
                                  setSelectedWorkOrder(workOrder);
                                  setIsWorkOrderDropdownOpen(false);
                                }}
                              >
                                <Text style={tw`text-[16px] text-gray-900`}>
                                  {workOrder.woNumber} - {workOrder.title}
                                </Text>
                              </TouchableOpacity>
                            ))}
                          </ScrollView>
                        </View>
                      )}
                    </View>
                  )}
                </>
              )}

              {clockInStatus && isPaid && (
                <>
                  <View style={tw`flex-row justify-between my-3`}>
                    <TouchableOpacity
                      onPress={() => openCameraModal("receipt")}
                      style={tw`flex-1 items-center mx-1`}
                    >
                      <View style={tw`relative`}>
                        <Ionicons name="receipt" size={48} color="#fd9a00" />
                        {receiptCount > 0 && (
                          <View
                            style={tw`absolute -top-1 -right-2 bg-red-500 w-5 h-5 rounded-full justify-center items-center`}
                          >
                            <Text style={tw`text-white text-[12px] font-bold`}>
                              {receiptCount}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={tw`mt-1 text-[12px] text-gray-900 text-center`}
                      >
                        Receipts
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => openCameraModal("image")}
                      style={tw`flex-1 items-center mx-1`}
                    >
                      <View style={tw`relative`}>
                        <FontAwesome name="image" size={48} color="#fd9a00" />
                        {imageCount > 0 && (
                          <View
                            style={tw`absolute -top-1 -right-2 bg-red-500 w-5 h-5 rounded-full justify-center items-center`}
                          >
                            <Text style={tw`text-white text-[12px] font-bold`}>
                              {imageCount}
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={tw`mt-1 text-[12px] text-gray-900 text-center`}
                      >
                        Images
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Modal
                    visible={cameraModalVisible}
                    transparent
                    animationType="slide"
                  >
                    <View style={tw`flex-1 bg-black`}>
                      {!permission?.granted ? (
                        <View
                          style={tw`flex-1 justify-center items-center px-5`}
                        >
                          <Text
                            style={tw`text-white text-[18px] text-center mb-4`}
                          >
                            We need your permission to access the camera
                          </Text>
                          <Button
                            onPress={requestPermission}
                            title="Grant Permission"
                            style={tw`bg-[#162435] py-2 px-4 rounded-xl`}
                            textColor="white"
                          />
                          <Button
                            onPress={() => setCameraModalVisible(false)}
                            title="Close"
                            style={tw`bg-gray-500 py-2 px-4 rounded-xl mt-2`}
                            textColor="white"
                          />
                        </View>
                      ) : (
                        <CameraView
                          style={tw`flex-1`}
                          ref={cameraRef}
                          facing={facing}
                        >
                          <View
                            style={tw`absolute top-12 left-5 right-5 flex-row justify-between mt-2`}
                          >
                            <TouchableOpacity
                              onPress={() => setCameraModalVisible(false)}
                              style={tw`p-2 bg-gray-900 rounded-full`}
                            >
                              <MaterialIcons
                                name="close"
                                size={28}
                                color="white"
                              />
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
                              onPress={() => {
                                setCameraModalVisible(false);
                                setTimeout(
                                  () => setGalleryModalVisible(true),
                                  300
                                );
                              }}
                              style={tw`p-2 bg-gray-900 rounded-full`}
                            >
                              <MaterialIcons
                                name="collections"
                                size={28}
                                color="white"
                              />
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={handleCapturePhoto}
                              style={tw`w-16 h-16 bg-white rounded-full flex items-center justify-center`}
                            >
                              <MaterialIcons
                                name="camera-alt"
                                size={32}
                                color="black"
                              />
                            </TouchableOpacity>
                          </View>
                        </CameraView>
                      )}
                    </View>
                  </Modal>

                  <Modal
                    visible={galleryModalVisible}
                    transparent
                    animationType="slide"
                  >
                    <TouchableOpacity
                      style={tw`flex-1 bg-black bg-opacity-50 justify-center items-center p-4`}
                      activeOpacity={1}
                      onPressOut={() => setGalleryModalVisible(false)}
                    >
                      <TouchableWithoutFeedback>
                        <View
                          style={tw`w-full bg-white rounded-xl p-4 max-h-[75%] shadow-md`}
                        >
                          <Text
                            style={tw`text-[18px] font-semibold text-gray-900 mb-4 text-center`}
                          >
                            {selectedType === "image" ? "Images" : "Receipts"}
                          </Text>
                          <FlatList
                            data={
                              selectedType === "image"
                                ? selectedImages
                                : receiptImages
                            }
                            keyExtractor={(item, index) => index.toString()}
                            numColumns={3}
                            renderItem={({ item, index }) => (
                              <View style={tw`relative m-1`}>
                                <Image
                                  source={{ uri: item.uri }}
                                  style={tw`w-[100px] h-[100px] rounded-lg`}
                                />
                                <TouchableOpacity
                                  onPress={() =>
                                    selectedType === "image"
                                      ? removeImage(index)
                                      : removeReceipt(index)
                                  }
                                  style={tw`absolute top-1 right-1 bg-black bg-opacity-60 rounded-full p-1`}
                                >
                                  <MaterialIcons
                                    name="close"
                                    size={16}
                                    color="white"
                                  />
                                </TouchableOpacity>
                              </View>
                            )}
                          />
                          <Button
                            mode="contained"
                            onPress={handleSelectFromLibrary}
                            style={tw`mt-4 bg-[#162435] py-2 rounded-xl`}
                            labelStyle={tw`text-[16px] text-white`}
                          >
                            Select from Library
                          </Button>
                          <Button
                            mode="contained"
                            onPress={() => setGalleryModalVisible(false)}
                            style={tw`mt-2 bg-[#162435] py-2 rounded-xl`}
                            labelStyle={tw`text-[16px] text-white`}
                          >
                            Close
                          </Button>
                        </View>
                      </TouchableWithoutFeedback>
                    </TouchableOpacity>
                  </Modal>

                  {clockInStatus && isPaid && (
                    <View
                      style={tw`bg-white shadow-md rounded-xl p-4 mx-2 mt-4 flex-row items-center justify-between`}
                    >
                      <View style={tw`flex-row items-center`}>
                        <MaterialIcons
                          name="person-pin"
                          size={24}
                          color={isFallDetected ? "#EF4444" : "#10B981"}
                          style={tw`mr-2`}
                        />
                        <Text
                          style={tw`text-[16px] text-gray-900 font-semibold`}
                        >
                          Fall Detection
                        </Text>
                      </View>
                      <View style={tw`flex-row items-center`}>
                        <View
                          style={tw`w-3 h-3 rounded-full mr-2 ${
                            isFallDetected ? "bg-red-500" : "bg-green-500"
                          }`}
                        />
                        <Text style={tw`text-[14px] text-gray-700`}>
                          {isFallDetected ? "Fall Detected" : "Active"}
                        </Text>
                      </View>
                    </View>
                  )}

                  <View style={tw`bg-white shadow-md rounded-xl p-4 mx-2 mt-4`}>
                    <View
                      style={tw`flex-row items-center justify-between mb-2`}
                    >
                      <Text style={tw`text-[18px] font-semibold text-gray-900`}>
                        Notes
                      </Text>
                      <TouchableOpacity
                        style={tw`flex-row items-center`}
                        onPress={openAddNoteModal}
                      >
                        <FontAwesome
                          name="plus-circle"
                          size={24}
                          color="#fd9a00"
                        />
                        <Text
                          style={tw`text-[16px] text-[#fd9a00] ml-2 font-semibold`}
                        >
                          Add Notes
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {inputText
                      .split("\n")
                      .filter((note) => note.trim() !== "")
                      .map((note, index) => (
                        <TouchableOpacity
                          key={index}
                          onPress={() => openEditNoteModal(note, index)}
                        >
                          <View
                            style={tw`bg-gray-100 rounded-lg p-3 my-1 border border-gray-300`}
                          >
                            <Text
                              style={tw`text-[16px] text-gray-700 leading-5`}
                            >
                              {note}
                            </Text>
                          </View>
                        </TouchableOpacity>
                      ))}
                  </View>

                  <Modal
                    animationType="slide"
                    transparent
                    visible={modalVisible}
                    onRequestClose={() => setModalVisible(false)}
                  >
                    <TouchableWithoutFeedback
                      onPress={() => setModalVisible(false)}
                    >
                      <View
                        style={tw`flex-1 justify-center items-center bg-black bg-opacity-50`}
                      >
                        <TouchableWithoutFeedback>
                          <View
                            style={tw`w-[90%] bg-white rounded-xl p-5 shadow-md`}
                          >
                            <Text
                              style={tw`text-[18px] font-semibold text-gray-900 mb-4 text-center`}
                            >
                              {editingIndex !== null ? "Edit Note" : "Add Note"}
                            </Text>
                            <TextInput
                              style={tw`h-[100px] w-full bg-gray-100 p-3 rounded-lg border border-gray-300 text-[16px] text-gray-900`}
                              placeholder="Write your note here..."
                              multiline
                              value={newNote}
                              onChangeText={setNewNote}
                            />
                            <TouchableOpacity
                              style={tw`bg-[#162435] py-3 px-6 rounded-xl mt-4 self-center`}
                              onPress={saveNote}
                            >
                              <Text
                                style={tw`text-white text-[16px] font-semibold`}
                              >
                                {editingIndex !== null
                                  ? "Save Changes"
                                  : "Add Note"}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        </TouchableWithoutFeedback>
                      </View>
                    </TouchableWithoutFeedback>
                  </Modal>
                </>
              )}
            </ScrollView>

            <View style={tw`mt-4 pb-4 px-5`}>
              <TouchableOpacity
                onPress={() => {
                  if (clockInStatus) {
                    finalizeClockOut();
                  } else {
                    handleClockIn();
                  }
                }}
                style={[
                  tw`self-center w-52 py-3 rounded-xl shadow-md`,
                  clockInStatus ? tw`bg-red-700` : tw`bg-orange-500`,
                  buttonDisabled && tw`opacity-50`,
                ]}
                activeOpacity={buttonDisabled ? 1 : 0.8}
                disabled={buttonDisabled}
              >
                {clockInStatus ? (
                  <View style={tw`flex-row items-center justify-center`}>
                    <Text style={tw`text-[18px] text-white font-semibold`}>
                      Clock Out
                    </Text>
                    <MaterialIcons
                      name="access-time"
                      size={20}
                      color="white"
                      style={tw`ml-2`}
                    />
                    <Text style={tw`ml-1 text-[16px] text-white`}>
                      {formatTime(elapsed)}
                    </Text>
                  </View>
                ) : (
                  <Text
                    style={tw`text-[18px] text-white font-semibold text-center`}
                  >
                    Clock In
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </>
        )}
      </SafeAreaView>
    </>
  );
}
