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
import * as Location from "expo-location";
import * as FileSystem from "expo-file-system";
import NetInfo from "@react-native-community/netinfo";
import { CameraView, useCameraPermissions, Camera } from "expo-camera";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Haversine formula to calculate distance between two points (in meters)
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
  const [ClockedIn, setClockedIn] = useState(initialClockedIn === "true");
  const [ClockInTime, setClockInTime] = useState(
    parsedClockData?.isClockedIn && parsedClockData?.timesheet?.start
      ? parsedClockData.timesheet.start
      : null
  );

  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const [timesheetId, setTimesheetId] = useState(
    parsedClockData?.isClockedIn && parsedClockData?.timesheet?._id
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
  const [userGeoFence, setUserGeoFence] = useState(false); // New state for geoFence
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
        if (savedNotes) {
          setInputText(savedNotes);
        }
      } catch (error) {
        console.error("Failed to load notes:", error);
      }
    };
    loadNotes();
  }, []);

  useEffect(() => {
    const checkPermissions = async () => {
      const { status } = await ImagePicker.getCameraPermissionsAsync();
      if (status !== "granted") {
        const { status: newStatus } =
          await ImagePicker.requestCameraPermissionsAsync();
        if (newStatus === "granted") {
          requestPermission();
        }
      }
    };
    checkPermissions();
  }, []);

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
        // This runs when the screen loses focus (e.g., when switching tabs)
        AsyncStorage.setItem("lastTab", "clock-in-out");
      };
    }, [])
  );

  const navigateToWorkOrderSelection = () => {
    if (!selectedProject) {
      alert("Please select a project first.");
      router.push("/select-project");
      return;
    }
    router.push("/select-work-order");
  };

  useEffect(() => {
    const initializeData = async () => {
      try {
        const storedUserId = await SecureStore.getItemAsync("userId");
        if (storedUserId) {
          setUserId(storedUserId);
        } else {
          console.error("User ID not found in SecureStore.");
          Alert.alert("Error", "User ID not found. Please log in again.");
          return;
        }

        const token = await SecureStore.getItemAsync("authToken");
        if (!token) {
          console.error("Auth token not found in SecureStore.");
          Alert.alert(
            "Error",
            "Authentication token missing. Please log in again."
          );
          return;
        }

        // Fetch user data by email to get geoFence
        const userResponse = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/users/email",
          {
            method: "GET",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
          }
        );

        if (!userResponse.ok) {
          throw new Error("Failed to fetch user data");
        }

        const userData = await userResponse.json();
        if (userData.success) {
          setUserGeoFence(userData.user.geoFence || false); // Set geoFence from response
        } else {
          console.error("User data fetch failed:", userData.message);
          setUserGeoFence(false); // Default to false if fetch fails
        }

        const netInfo = await NetInfo.fetch();
        if (netInfo.isConnected) {
          const projectsResponse = await fetch(
            "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects/hourly",
            { headers: { Authorization: `Bearer ${token}` } }
          );

          if (!projectsResponse.ok) {
            throw new Error("Failed to fetch hourly projects");
          }
          const data = await projectsResponse.json();

          console.log(data[0].workOrders);

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
        } else {
          const storedProjects = await SecureStore.getItemAsync("projects");
          if (storedProjects) {
            setProjects(JSON.parse(storedProjects));
          } else {
            Alert.alert(
              "No Projects Found",
              "Please connect to the internet to fetch projects."
            );
          }
        }

        await loadDetails();
        await checkClockInStatus();

        const storedValue = await SecureStore.getItemAsync("vehiclePermission");
        if (storedValue) {
          setVehiclePermission(JSON.parse(storedValue));
        }

        const { status: mediaLibraryStatus } =
          await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (mediaLibraryStatus !== "granted") {
          Alert.alert(
            "Media Library Permission",
            "Permission to access the media library was denied."
          );
          setErrorMsg("Permission to access the media library was denied");
          return;
        }

        const { status: notificationStatus } =
          await Notifications.requestPermissionsAsync();
        if (notificationStatus !== "granted") {
          alert("Permission to access notifications was denied");
          setErrorMsg("Permission to access notifications was denied");
          return;
        }

        const { status: locationStatus } =
          await Location.requestForegroundPermissionsAsync();
        if (locationStatus !== "granted") {
          alert("Permission to access location was denied");
          setErrorMsg("Permission to access location was denied");
          return;
        }

        if (Platform.OS === "android") {
          const { status: backgroundLocationStatus } =
            await Location.requestBackgroundPermissionsAsync();
          if (backgroundLocationStatus !== "granted") {
            alert("Permission to access background location was denied");
            setErrorMsg("Permission to access background location was denied");
            return;
          }
        }

        if (Platform.OS === "ios") {
          const { status: alwaysStatus } =
            await Location.requestBackgroundPermissionsAsync();
          if (alwaysStatus !== "granted") {
            alert(
              "Always location permission denied. Please enable in settings."
            );
            setErrorMsg("Always location permission was denied");
          }
        }

        await checkClockInStatus();

        setLoading(false);
        setButtonDisabled(false);
      } catch (error) {
        console.error("Error during initialization:", error);
        setLoading(false);
      }
    };

    initializeData();
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

  const getLocalTimeISOString = () => {
    const now = new Date();
    // Get the timezone offset in minutes and convert to ISO string
    const offset = now.getTimezoneOffset();
    const localTime = new Date(now.getTime() - offset * 60000);
    const isoString = localTime.toISOString().replace(/\.\d{3}Z$/, "");

    // Get timezone name/abbreviation (e.g., "EST", "EDT")
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    return {
      time: isoString,
      timezone: timezone,
      offset: offset / 60, // Convert to hours
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

  const clearNotesAfterLockout = async () => {
    try {
      await AsyncStorage.removeItem("savedNotes");
      console.log("Notes cleared after lockout.");
    } catch (error) {
      console.error("Failed to clear notes:", error);
    }
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
    if (ClockedIn && ClockInTime) {
      const startTime = new Date(ClockInTime).getTime();
      const now = Date.now();
      let elapsedTime = Math.floor((now - startTime) / 1000);

      if (!startTime || isNaN(startTime)) return;
      if (elapsedTime < 0) elapsedTime = 0;

      setElapsed(elapsedTime);

      const tick = () => {
        setElapsed((prevElapsed) => prevElapsed + 1);
        timer = setTimeout(tick, 1000);
      };

      tick();
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [ClockedIn, ClockInTime]);

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

        // Verify the file exists and get its info
        const fileInfo = await FileSystem.getInfoAsync(image.uri);
        if (!fileInfo.exists) {
          throw new Error(`File at ${image.uri} does not exist`);
        }
        console.log("File info:", fileInfo);

        // Append the file to FormData
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

  const postLocationsToServer = async (locationsArray) => {
    try {
      const timesheetId = await AsyncStorage.getItem("timesheetId");
      const email = await SecureStore.getItemAsync("userEmail");
      const token = await SecureStore.getItemAsync("authToken");

      const payload = {
        timesheetId: timesheetId,
        email: email,
        locations: locationsArray,
      };

      const response = await fetch(
        "https://erp-production-72da01c8e651.herokuapp.com/updateTimesheet",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }
      );

      if (response.ok) {
        console.log("Timesheet updated successfully");
      } else {
        console.error("Failed to update timesheet");
      }
    } catch (error) {
      console.error(`Error posting locations: ${error.message}`);
    }
  };

  const getEasternTimeISOString = () => {
    const now = new Date();
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const startDst = new Date(now.getFullYear(), 2, 8);
    startDst.setDate(8 + (7 - startDst.getDay()));
    const endDst = new Date(now.getFullYear(), 10, 1);
    endDst.setDate(1 + (7 - endDst.getDay()));
    const isInDst = now >= startDst && now < endDst;
    const offset = isInDst ? -240 : -300;
    const easternTime = new Date(utcTime + offset * 60000);
    return easternTime.toISOString().replace(/\.\d{3}Z$/, "");
  };

  const checkClockInStatus = async () => {
    if (parsedClockData) {
      // Use passed data instead of fetching

      setClockedIn(!!parsedClockData.isClockedIn);
      if (parsedClockData.isClockedIn && parsedClockData.timesheet) {
        const timesheet = parsedClockData.timesheet;

        // Set selectedProject with projectName
        setSelectedProject({
          projectName: timesheet.projectName || "Unknown Project",
        });

        // Set selectedWorkOrder with woNumber and title
        setSelectedWorkOrder({
          woNumber: timesheet.woNumber || "Unknown WO",
          title: timesheet.title || "N/A",
        });

        // Set other timesheet-related states
        setTimesheetId(timesheet._id);
        setClockInTime(timesheet.start);
        setUsePersonalVehicle(timesheet.usePersonalVehicle || false); // Ensure this state is set

        // Save the full timesheet data as ClockInData
        const clockInData = {
          projectId: timesheet.project, // Assuming this is still needed for clock-out
          workOrderId: timesheet.workOrder, // Assuming this is still needed for clock-out
          start: timesheet.start,
          email: timesheet.email,
          userId: timesheet.user,
          timesheetId: timesheet._id,
          locations: timesheet.locations || [],
          usePersonalVehicle: timesheet.usePersonalVehicle || false,
          isOnline: true, // Assuming it’s online since it’s fetched
        };

        await AsyncStorage.setItem("ClockInData", JSON.stringify(clockInData));

        // Save selectedProject and selectedWorkOrder for display consistency
        await AsyncStorage.setItem(
          "selectedProject",
          JSON.stringify({ projectName: timesheet.projectName })
        );
        await AsyncStorage.setItem(
          "selectedWorkOrder",
          JSON.stringify({
            woNumber: timesheet.woNumber,
            title: timesheet.title || "N/A",
          })
        );

        // Set ClockedIn status
        await AsyncStorage.setItem("ClockedIn", JSON.stringify(true));
      }
    } else {
      // Fallback to fetching if no clockData is passed
      try {
        const token = await SecureStore.getItemAsync("authToken");
        const userId = await SecureStore.getItemAsync("userId");

        if (!userId || !token) {
          console.error("Missing userId or token");
          setClockedIn(initialClockedIn === "true");
          return;
        }

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

        if (!response.ok) {
          throw new Error("Failed to fetch current timesheet");
        }

        const data = await response.json();
        setClockedIn(!!data.isClockedIn);
        if (data.isClockedIn && data.timesheet) {
          const timesheet = data.timesheet;

          // Set from fetched data
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

          // Save the full timesheet data as ClockInData
          const clockInData = {
            projectId: timesheet.project, // Assuming this is still needed
            workOrderId: timesheet.workOrder, // Assuming this is still needed
            start: timesheet.start,
            email: timesheet.email,
            userId: timesheet.user,
            timesheetId: timesheet._id,
            locations: timesheet.locations || [],
            usePersonalVehicle: timesheet.usePersonalVehicle || false,
            isOnline: true,
          };

          await AsyncStorage.setItem(
            "ClockInData",
            JSON.stringify(clockInData)
          );

          // Save selectedProject and selectedWorkOrder
          await AsyncStorage.setItem(
            "selectedProject",
            JSON.stringify({ projectName: timesheet.projectName })
          );
          await AsyncStorage.setItem(
            "selectedWorkOrder",
            JSON.stringify({
              woNumber: timesheet.woNumber,
              title: timesheet.title || "N/A",
            })
          );

          await AsyncStorage.setItem("ClockedIn", JSON.stringify(true));
        }
      } catch (err) {
        console.error("Error checking clock-in status:", err);
        setClockedIn(initialClockedIn === "true");
      }
    }
  };

  const handleClockIn = async () => {
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

      const { status: locationStatus } =
        await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== "granted") {
        alert("Permission to access location was denied");
        setErrorMsg("Permission to access location was denied");
        setButtonDisabled(false);
        return;
      }

      if (Platform.OS === "android") {
        const { status: backgroundLocationStatus } =
          await Location.requestBackgroundPermissionsAsync();
        if (backgroundLocationStatus !== "granted") {
          alert("Permission to access background location was denied");
          setButtonDisabled(false);
          setErrorMsg("Permission to access background location was denied");
          return;
        }
      }

      // Get user's current location
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      const userLat = location.coords.latitude;
      const userLon = location.coords.longitude;

      // Check geofence if user.geoFence is true
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
      setLocations([{ coords: { latitude: userLat, longitude: userLon } }]);

      const timeData = getLocalTimeISOString();
      const newTime = timeData.time;
      setClockInTime(newTime);
      setElapsed(0);

      await AsyncStorage.setItem("ClockInTime", newTime);

      const userEmail = await SecureStore.getItemAsync("userEmail");

      const clockInData = {
        projectId: selectedProject._id,
        workOrderId: selectedWorkOrder._id,
        start: newTime,
        email: userEmail,
        userId: userId,
        timezone: timeData.timezone, // Add timezone
        timezoneOffset: timeData.offset, // Add offset
        locations: [{ latitude: userLat, longitude: userLon }],
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
              body: JSON.stringify(clockInData), // Send the full clockInData object
            }
          );

          if (response.ok) {
            const responseData = await response.json();
            setButtonDisabled(false);
            const timesheetId = responseData.timesheetId;

            await AsyncStorage.setItem("timesheetId", timesheetId);
            await AsyncStorage.setItem("ClockedIn", JSON.stringify(true));

            clockInData.timesheetId = timesheetId;
            clockInData.clockInTime = newTime;
            await AsyncStorage.setItem(
              "ClockInData",
              JSON.stringify(clockInData)
            );

            setClockedIn(true);
            setIsSelectionLocked(true);
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
        await AsyncStorage.setItem("ClockInData", JSON.stringify(clockInData));
        Alert.alert(
          "Offline",
          "You are offline. Your clock-in data will be synced when you clock out."
        );
        await AsyncStorage.setItem("ClockedIn", JSON.stringify(true));
        setClockedIn(true);
        setIsSelectionLocked(true);
        setButtonDisabled(false);
      }
    } catch (error) {
      console.error("Error during clock-in:", error);
      setButtonDisabled(false);
    }
  };

  const finalizeClockOut = async () => {
    setButtonDisabled(true);
    setIsSelectionLocked(true);

    if (!inputText.trim()) {
      Alert.alert(
        "Input Required",
        "Please enter a note describing the work completed before clocking out."
      );
      setButtonDisabled(false);
      setIsSelectionLocked(false);
      return;
    }

    await loadDetails();

    const clockInData = JSON.parse(await AsyncStorage.getItem("ClockInData"));

    if (clockInData) {
      const timeData = getLocalTimeISOString();
      const clockOutTime = timeData.time;

      const userEmail = await SecureStore.getItemAsync("userEmail");

      const storedLocations = await AsyncStorage.getItem("locations");
      let locationData = storedLocations ? JSON.parse(storedLocations) : [];

      const locationDataArray = locationData.map((location) => ({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        timestamp: location.timestamp,
      }));

      const offlineId = `offline-${Date.now()}`;

      const clockOutPayload = {
        timesheetId: clockInData.timesheetId,
        end: clockOutTime,
        clockInStatus: false,
        email: userEmail,
        userId: userId,
        timezone: timeData.timezone, // Add timezone
        timezoneOffset: timeData.offset, // Add offset
        locations: locationDataArray,
        workOrderDescription: inputText,
      };

      try {
        const netInfo = await NetInfo.fetch();
        console.log("here colocking out");

        const fullPayload = {
          ...clockInData,
          end: clockOutTime,
          clockInStatus: false,
          email: userEmail,
          userId: userId,
          offlineId,
          locations: locationDataArray,
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
            offlineId: offlineId,
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
            JSON.stringify(offlineReceipts)
          );

          Alert.alert(
            "Offline",
            "You are offline. Your timesheet and images will be synced when you are online."
          );

          await AsyncStorage.setItem("ClockedIn", "false");
          await AsyncStorage.removeItem("timesheetId");
          await AsyncStorage.setItem("locations", JSON.stringify([]));
          await AsyncStorage.removeItem("ClockInData");
          await AsyncStorage.removeItem("selectedProject");
          await AsyncStorage.removeItem("selectedWorkOrder");

          AsyncStorage.removeItem("storedImages");
          setSelectedImages([]);
          setImageCount(0);

          AsyncStorage.removeItem("storedReceipts");
          setReceiptImages([]);
          setReceiptCount(0);

          clearNotesAfterLockout();

          setModalVisible(false);
          setClockedIn(false);
          setButtonDisabled(false);
          setInputText("");
          setIsSelectionLocked(false);

          const displayName = await SecureStore.getItemAsync("userName");
        } else {
          if (clockInData.isOnline) {
            console.log("here 4");
            const token = await SecureStore.getItemAsync("authToken");
            const response = await fetch(
              "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/clock-out",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  "X-User-ID": userId,
                },
                body: JSON.stringify({
                  userId: userId,
                  end: clockOutTime,
                  timezone: timeData.timezone, // Add timezone
                  timezoneOffset: timeData.offset, // Add offset
                }),
              }
            );

            if (response.ok) {
              if (selectedImages.length > 0 || receiptImages.length > 0) {
                await delay(50); // Delay only when there are images to upload
              }
              console.log(selectedImages);

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

              const displayName = await SecureStore.getItemAsync("userName");

              await AsyncStorage.setItem("ClockedIn", "false");
              await AsyncStorage.removeItem("timesheetId");
              await AsyncStorage.setItem("locations", JSON.stringify([]));
              await AsyncStorage.removeItem("ClockInData");
              await AsyncStorage.removeItem("selectedProject");
              await AsyncStorage.removeItem("selectedWorkOrder");
              clearNotesAfterLockout();

              AsyncStorage.removeItem("storedImages");
              setSelectedImages([]);
              setImageCount(0);

              AsyncStorage.removeItem("storedReceipts");
              setReceiptImages([]);
              setReceiptCount(0);

              setModalVisible(false);
              setClockedIn(false);
              setButtonDisabled(false);
              setInputText("");
              setIsSelectionLocked(false);
            } else {
              throw new Error("Failed to update clock-out data");
            }
          } else {
            const offlineClockOutPayload = {
              ...clockInData,
              end: clockOutTime,
              clockInStatus: false,
              email: userEmail,
              userId: userId,
              timezone: timeData.timezone, // Add timezone
              timezoneOffset: timeData.offset, // Add offset
              locations: locationDataArray,
              workOrderDescription: inputText,
            };

            const token = await SecureStore.getItemAsync("authToken");
            const response = await fetch(
              "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/clockOutOffline",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${token}`,
                  "X-User-ID": userId,
                },
                body: JSON.stringify(offlineClockOutPayload),
              }
            );

            if (response.ok) {
              if (selectedImages.length > 0 || receiptImages.length > 0) {
                await delay(50); // Delay only when there are images to upload
              }

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

              const displayName = await SecureStore.getItemAsync("userName");

              setReceiptImages([]);
              setSelectedImages([]);

              await AsyncStorage.setItem("ClockedIn", "false");
              await AsyncStorage.removeItem("timesheetId");
              await AsyncStorage.setItem("locations", JSON.stringify([]));
              await AsyncStorage.removeItem("ClockInData");
              await AsyncStorage.removeItem("selectedProject");
              await AsyncStorage.removeItem("selectedWorkOrder");

              setModalVisible(false);
              setClockedIn(false);
              setButtonDisabled(false);
              setInputText("");
              setIsSelectionLocked(false);
              clearNotesAfterLockout();

              AsyncStorage.removeItem("storedImages");
              setSelectedImages([]);
              setImageCount(0);

              AsyncStorage.removeItem("storedReceipts");
              setReceiptImages([]);
              setReceiptCount(0);
            } else {
              throw new Error("Failed to send offline clock-out data");
            }
          }
        }
      } catch (error) {
        console.error("Error during clock-out:", error);
        setButtonDisabled(false);
        setIsSelectionLocked(false);
      }
    }
  };

  const saveDetails = async () => {
    try {
      await AsyncStorage.multiSet([
        ["ClockedIn", JSON.stringify(ClockedIn)],
        ["ClockInTime", JSON.stringify(ClockInTime)],
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
    setSelectedType(type);
    setCameraModalVisible(true);
  };

  const handleCapturePhoto = async () => {
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
        // Get available picture sizes
        const availableSizes =
          await cameraRef.current.getAvailablePictureSizesAsync();
        console.log("Available picture sizes:", availableSizes);

        // Find a 4:3 aspect ratio size (width:height = 4:3)
        let pictureSize = availableSizes.find((size) => {
          const [width, height] = size.split("x").map(Number);
          const aspectRatio = width / height;
          return Math.abs(aspectRatio - 4 / 3) < 0.05; // Allow small deviation
        });

        // Fallback to a reasonable default if no 4:3 size is found
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

        // Take the photo with the selected 4:3 resolution
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.5, // Adjust quality as needed (0 to 1)
          base64: false,
          pictureSize, // Use the dynamically selected size
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

              {!ClockedIn && (
                <>
                  {/* Project Dropdown */}
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
                                setSelectedWorkOrder(null); // Reset work order when project changes
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

                  {/* Work Order Dropdown */}
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

              {ClockedIn && (
                <>
                  <View style={tw`flex-row justify-between my-3`}>
                    <TouchableOpacity
                      onPress={() => openCameraModal("receipt")}
                      style={tw`flex-1 items-center mx-1`}
                    >
                      <View style={tw`relative`}>
                        <Ionicons name="receipt" size={48} color="#162435" />
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
                        <FontAwesome name="image" size={48} color="#162435" />
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
                          color="#162435"
                        />
                        <Text
                          style={tw`text-[16px] text-[#162435] ml-2 font-semibold`}
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
                  if (ClockedIn) {
                    if (!inputText.trim()) {
                      Alert.alert(
                        "Add Notes",
                        "You must add notes before clocking out.",
                        [{ text: "OK" }]
                      );
                    } else {
                      finalizeClockOut();
                    }
                  } else {
                    handleClockIn();
                  }
                }}
                style={[
                  tw`self-center w-52 py-3 rounded-xl shadow-md`,
                  ClockedIn ? tw`bg-red-700` : tw`bg-green-700`,
                  buttonDisabled && tw`opacity-50`,
                ]}
                activeOpacity={buttonDisabled ? 1 : 0.8}
                disabled={buttonDisabled}
              >
                {ClockedIn ? (
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
