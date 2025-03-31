// tasks.js
import * as TaskManager from "expo-task-manager";
import BackgroundGeolocation from "react-native-background-geolocation";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";
import * as SecureStore from "expo-secure-store";

// Define task name and constants
export const FALL_DETECTION_TASK = "fall-detection-task";
const FREE_FALL_THRESHOLD = 0.3;
const IMPACT_THRESHOLD = 2.0;
const FALL_CONFIRMATION_WINDOW = 2000;
const ACCELEROMETER_UPDATE_INTERVAL = 500;
const LOCATION_TIMEOUT = 30;
const LOCATION_MAX_AGE = 10000;
const LOCATION_ACCURACY = BackgroundGeolocation.DESIRED_ACCURACY_HIGH;
const TIMESHEET_UPDATE_ENDPOINT =
  "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/timesheets/update-timesheet";

// Function to post locations to server
const postLocationsToServer = async (locationsArray, fallDetected = false) => {
  try {
    const timesheetId = await AsyncStorage.getItem("timesheetId");
    const email = await SecureStore.getItemAsync("userEmail");
    const token = await SecureStore.getItemAsync("authToken");

    if (!timesheetId || !email || !token) {
      throw new Error("Missing required data: timesheetId, email, or token");
    }

    const payload = {
      timesheetId,
      email,
      locations: locationsArray,
      fallDetected,
    };

    const response = await fetch(TIMESHEET_UPDATE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(
        `Timesheet updated successfully${
          fallDetected ? " with fall detected" : ""
        }`
      );
    } else {
      const errorText = await response.text();
      console.error("Failed to update timesheet:", response.status, errorText);
    }
  } catch (error) {
    console.error("Error posting locations to server:", error.message);
  }
};

// Function to trigger emergency location
const triggerEmergencyLocation = async (location) => {
  try {
    const emergencyLocation = {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      timestamp: new Date().toISOString(),
      isEmergency: true,
    };

    const storedLocations = await AsyncStorage.getItem("locations");
    const locationsArray = storedLocations ? JSON.parse(storedLocations) : [];
    locationsArray.push(emergencyLocation);
    await AsyncStorage.setItem("locations", JSON.stringify(locationsArray));

    // Set fall detected flag
    await AsyncStorage.setItem("isFallDetected", JSON.stringify(true));

    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      await postLocationsToServer(locationsArray, true);
    } else {
      console.log(
        "Offline: Emergency location stored, will sync later with fall detection"
      );
    }

    Alert.alert(
      "Fall Detected!",
      "Your location has been recorded and emergency response initiated."
    );
  } catch (error) {
    console.error("Error triggering emergency location:", error.message);
  }
};

// Define the background task
TaskManager.defineTask(FALL_DETECTION_TASK, async ({ data, error }) => {
  if (error) {
    console.error("TaskManager error:", error);
    return;
  }

  const { x, y, z } = data;
  const magnitude = Math.sqrt(x * x + y * y + z * z);

  if (magnitude < FREE_FALL_THRESHOLD) {
    console.log("Possible free fall detected in background:", magnitude);
    setTimeout(async () => {
      try {
        const location = await BackgroundGeolocation.getCurrentPosition({
          timeout: LOCATION_TIMEOUT,
          maximumAge: LOCATION_MAX_AGE,
          desiredAccuracy: LOCATION_ACCURACY,
        });
        const currentMagnitude = await new Promise((resolve) => {
          Accelerometer.addListener((latestData) => {
            const mag = Math.sqrt(
              latestData.x * latestData.x +
                latestData.y * latestData.y +
                latestData.z * latestData.z
            );
            resolve(mag);
            Accelerometer.removeAllListeners();
          });
        });
        if (currentMagnitude > IMPACT_THRESHOLD) {
          console.log("Fall detected in background:", currentMagnitude);
          await triggerEmergencyLocation(location);
        }
      } catch (err) {
        console.error("Error in fall detection task:", err);
      }
    }, FALL_CONFIRMATION_WINDOW);
  }
});

console.log(`Task ${FALL_DETECTION_TASK} defined`);

export { postLocationsToServer };
