// tasks.js
import * as TaskManager from "expo-task-manager";
import * as BackgroundGeolocation from "react-native-background-geolocation";
import { Accelerometer } from "expo-sensors";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { Alert } from "react-native";

// Define the task name
export const FALL_DETECTION_TASK = "fall-detection-task";

// Function to trigger emergency location (moved here for reusability)
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

    const netInfo = await NetInfo.fetch();
    if (netInfo.isConnected) {
      // Placeholder for postEmergencyLocationToServer (implement as needed)
      console.log("Emergency location posted to server:", emergencyLocation);
    } else {
      console.log("Offline: Emergency location stored, will sync later");
    }

    Alert.alert(
      "Fall Detected!",
      "Your location has been recorded for emergency response."
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

  if (magnitude < 0.3) {
    // Free fall threshold
    console.log("Possible free fall detected in background:", magnitude);
    setTimeout(async () => {
      try {
        const location = await BackgroundGeolocation.getCurrentPosition({
          timeout: 30,
          maximumAge: 10000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
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
        if (currentMagnitude > 2.0) {
          // Impact threshold
          console.log("Fall detected in background:", currentMagnitude);
          await triggerEmergencyLocation(location);
        }
      } catch (err) {
        console.error("Error in fall detection task:", err);
      }
    }, 2000); // 2-second confirmation window
  }
});

console.log(`Task ${FALL_DETECTION_TASK} defined`);
