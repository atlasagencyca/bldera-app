import { useLocalSearchParams, useRouter } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { FontAwesome } from "@expo/vector-icons";
import React, { useState } from "react";
import { View, Text, TouchableOpacity, ScrollView } from "react-native";
import tw from "twrnc";

export default function SelectProjectScreen() {
  const router = useRouter();
  const { projects } = useLocalSearchParams();

  const [projectList, setProjectList] = useState(
    projects ? JSON.parse(projects) : []
  );

  const handleSelectProject = async (project) => {
    try {
      await AsyncStorage.setItem("selectedProject", JSON.stringify(project));
      router.back();
    } catch (error) {
      console.error("Failed to save project:", error);
    }
  };

  const handleGoBack = () => {
    router.back();
  };

  return (
    <View style={tw`flex-1 bg-[#162435] p-2.5`}>
      <ScrollView>
        {projectList.length > 0 ? (
          projectList.map((project, index) => (
            <TouchableOpacity
              key={index}
              style={tw`flex-row items-center p-3.75 bg-[#333] mb-2.5 rounded-[10px]`}
              onPress={() => handleSelectProject(project)}
            >
              <View
                style={tw`w-10 h-10 bg-[#162435] justify-center items-center rounded-[20px]`}
              >
                <FontAwesome name="building" size={24} color="white" />
              </View>
              <View style={tw`ml-2.5 p-3.5`}>
                <Text style={tw`text-[16px] text-white p-2.5`}>
                  {project.projectName}
                </Text>
              </View>
            </TouchableOpacity>
          ))
        ) : (
          <View style={tw`flex-1 justify-center items-center mt-5`}>
            <Text style={tw`text-[16px] text-gray-500 text-center mb-5`}>
              No projects available
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
