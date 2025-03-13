import { useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome } from "@expo/vector-icons";
import React, { useState, useEffect } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import tw from "twrnc";

export default function SelectWorkOrderScreen() {
  const router = useRouter();
  const [workOrderList, setWorkOrderList] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadWorkOrders = async () => {
      try {
        const storedProject = await AsyncStorage.getItem("selectedProject");
        if (storedProject) {
          const project = JSON.parse(storedProject);
          // Filter work orders to only include those with type "hourly"
          const hourlyWorkOrders = (project.workOrders || []).filter(
            (workOrder) => workOrder.type === "hourly"
          );
          setWorkOrderList(hourlyWorkOrders);
        }
      } catch (error) {
        console.error("Failed to load work orders:", error);
      } finally {
        setLoading(false);
      }
    };
    loadWorkOrders();
  }, []);

  const handleSelectWorkOrder = async (workOrder) => {
    try {
      await AsyncStorage.setItem(
        "selectedWorkOrder",
        JSON.stringify(workOrder)
      );
      router.back();
    } catch (error) {
      console.error("Failed to save work order:", error);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-[#162435]`}>
        <Text style={tw`text-[16px] text-white mb-5`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-[#162435] p-2.5`}>
      <ScrollView>
        {workOrderList.length > 0 ? (
          workOrderList.map((workOrder, index) => (
            <TouchableOpacity
              key={workOrder._id?.$oid || index}
              style={tw`flex-row items-center p-3.75 bg-[#333] mb-2.5 rounded-[10px]`}
              onPress={() => handleSelectWorkOrder(workOrder)}
            >
              <View
                style={tw`w-10 h-10 bg-[#162435] justify-center items-center rounded-[20px]`}
              >
                <FontAwesome name="tasks" size={24} color="white" />
              </View>
              <View style={tw`ml-2.5 p-3.5`}>
                <Text style={tw`text-[16px] text-white p-2.5`}>
                  {workOrder.title}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={tw`flex-1 justify-center items-center mt-5`}>
            <Text style={tw`text-[16px] text-gray-500 text-center mb-5`}>
              No hourly work orders available
            </Text>
            <TouchableOpacity
              style={tw`p-2 bg-[#333] rounded-[10px]`}
              onPress={handleGoBack}
            >
              <Text style={tw`text-[16px] text-white`}>Go Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
