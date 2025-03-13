// hooks/useAuth.js
import { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const useAuth = () => {
  const [user, setUser] = useState(null);
  useEffect(() => {
    const checkAuth = async () => {
      const token = await AsyncStorage.getItem("authToken");
      if (token) {
        const response = await fetch(`${API_BASE_URL}/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await response.json();
        if (data.role === "foreman") setUser(data);
      }
    };
    checkAuth();
  }, []);
  return { user, setUser };
};
