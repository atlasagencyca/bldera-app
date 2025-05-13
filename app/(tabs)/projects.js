import { TouchableOpacity, View, Text, FlatList } from "react-native";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import tw from "twrnc";
import FontAwesome6 from "@expo/vector-icons/FontAwesome6";

export default function ProjectsScreen() {
  const router = useRouter();
  const [userRole, setUserRole] = useState(null);
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [loading, setLoading] = useState(false);

  const fetchUserRole = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const userId = await SecureStore.getItemAsync("userId");
      const email = await SecureStore.getItemAsync("userEmail");

      if (!email || !token || !userId) {
        throw new Error("Missing email, token, or user ID");
      }

      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/users/me/${encodeURIComponent(
          email
        )}`,
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
        throw new Error("Failed to fetch user data");
      }

      const data = await response.json();
      if (data.success) {
        setUserRole(data.user.role || "unassigned");
      }
    } catch (error) {
      console.error("Error fetching user role:", error);
    }
  };

  const fetchProjects = async () => {
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
      return data; // Return projects for use in loadData
    } catch (error) {
      console.error("Error fetching projects:", error);
      return [];
    } finally {
      setLoading(false);
    }
  };

  const loadSelectedProject = async (projects) => {
    try {
      const storedProjectId = await SecureStore.getItemAsync(
        "selectedProjectId"
      );
      if (storedProjectId) {
        const project = projects.find((p) => p._id === storedProjectId);
        if (project) {
          setSelectedProject(project);
        }
      }
    } catch (error) {
      console.error("Error loading selected project:", error);
    }
  };

  const handleSelectProject = async (project) => {
    try {
      setSelectedProject(project);
      await SecureStore.setItemAsync("selectedProjectId", project._id);
    } catch (error) {
      console.error("Error saving selected project:", error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      await fetchUserRole();
      const projects = await fetchProjects();
      await loadSelectedProject(projects);
    };
    loadData();
  }, []);

  const isSiteWorker = userRole === "site_worker";

  const menuItems = [
    {
      name: "Materials",
      route: "material-order",
      icon: <Feather name="package" size={32} color="#4B5563" />,
      visible: !isSiteWorker,
    },
    {
      name: "RFI",
      route: "rfi",
      icon: (
        <FontAwesome6 name="file-circle-question" size={32} color="#4B5563" />
      ),
      visible: !isSiteWorker,
    },
    {
      name: "T&M",
      route: "time-and-material",
      icon: (
        <MaterialCommunityIcons name="timetable" size={32} color="#4B5563" />
      ),
      visible: !isSiteWorker,
    },
    {
      name: "Progress Report",
      route: "progressLogScreen",
      icon: <Ionicons name="journal-sharp" size={32} color="#4B5563" />,
      visible: !isSiteWorker,
    },
    {
      name: "Pieceworker Logs",
      route: "pieceworker-time",
      icon: <Feather name="file-text" size={32} color="#4B5563" />,
      visible: !isSiteWorker,
    },
  ].filter((item) => item.visible);

  const renderProjectItem = ({ item }) => (
    <TouchableOpacity
      style={tw`bg-white rounded-lg shadow-md p-4 flex-1 m-2 items-center justify-center h-20 border border-gray-100`}
      onPress={() => handleSelectProject(item)}
    >
      <FontAwesome6 name="building" size={32} color="#4B5563" />
      <Text style={tw`text-black text-sm font-semibold mt-2 text-center`}>
        {item.projectName}
      </Text>
    </TouchableOpacity>
  );

  const renderMenuItem = ({ item }) => (
    <TouchableOpacity
      style={tw`bg-white rounded-lg shadow-md p-4 flex-1 m-2 items-center justify-center h-20 border border-gray-100`}
      onPress={() =>
        router.push({
          pathname: item.route,
          params: { projectId: selectedProject._id },
        })
      }
    >
      {item.icon}
      <Text style={tw`text-black text-sm font-semibold mt-2 text-center`}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={tw`flex-1 bg-gray-100 justify-center items-center`}>
        <Text style={tw`text-2xl text-gray-900 font-bold`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-100`}>
      <View style={tw`px-4 pt-2 pb-4`}>
        {/* Title Card */}
        <View
          style={tw`bg-white rounded-lg shadow-md p-4 mb-2 border border-gray-100`}
        >
          <Text style={tw`text-2xl font-bold text-gray-900`}>
            {selectedProject ? selectedProject.projectName : "Select Project"}
          </Text>
          {selectedProject && (
            <Text style={tw`text-sm text-gray-500 mt-1`}>
              Project Management
            </Text>
          )}
        </View>

        {/* Project Selection or Menu Grid */}
        {selectedProject ? (
          <>
            <FlatList
              data={menuItems}
              renderItem={renderMenuItem}
              keyExtractor={(item) => item.route}
              numColumns={2}
              columnWrapperStyle={tw`justify-between`}
              ListEmptyComponent={
                <Text style={tw`text-gray-500 text-center`}>
                  No options available
                </Text>
              }
            />
            {/* Change Project Button */}
            <TouchableOpacity
              style={tw`bg-gray-200 rounded-lg p-3 mt-4 shadow-sm border border-gray-100`}
              onPress={() => setSelectedProject(null)}
            >
              <Text
                style={tw`text-gray-900 text-base font-semibold text-center`}
              >
                Change Project
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <FlatList
            data={projects}
            renderItem={renderProjectItem}
            keyExtractor={(item) => item._id}
            numColumns={2}
            columnWrapperStyle={tw`justify-between`}
            ListEmptyComponent={
              <Text style={tw`text-gray-500 text-center`}>
                No projects available
              </Text>
            }
          />
        )}
      </View>
    </View>
  );
}
