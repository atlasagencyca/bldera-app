import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Image,
  Platform,
  Linking, // Added for mailto
} from "react-native";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { FontAwesome } from "@expo/vector-icons";
import tw from "twrnc";
import { LinearGradient } from "expo-linear-gradient";
import * as ImagePicker from "expo-image-picker";
import { SelectList } from "react-native-dropdown-select-list";
import * as FileSystem from "expo-file-system"; // Added for file handling
import * as Sharing from "expo-sharing"; // Added for sharing

export default function RFIScreen() {
  const router = useRouter();
  const scrollViewRef = useRef(null);
  const [stage, setStage] = useState("selectProject");
  const [projects, setProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [rfis, setRfis] = useState([]);
  const [isCreating, setIsCreating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [contacts, setContacts] = useState([]);

  const [newRfi, setNewRfi] = useState({
    rfiTitle: "",
    references: "",
    status: "open",
    customerContacts: [],
    questions: [],
  });
  const [loading, setLoading] = useState(false);
  const [showQuestionInput, setShowQuestionInput] = useState(false);
  const [questionInput, setQuestionInput] = useState({
    questionTitle: "",
    questionBody: "",
    answer: "",
    imageAttachment: null,
  });
  const [editingQuestionIndex, setEditingQuestionIndex] = useState(null);

  const statusOptions = [
    { key: "open", value: "Open" },
    { key: "in-progress", value: "In Progress" },
    { key: "answered", value: "Answered" },
  ];

  const dropdownStyles = {
    boxStyles: tw`bg-gray-100 border border-gray-300 rounded-lg mb-3 h-12`,
    inputStyles: tw`text-gray-900 text-[18px]`,
    dropdownStyles: tw`bg-white border border-gray-300 rounded-lg shadow-md`,
    dropdownItemStyles: (index) =>
      tw`p-3 ${index % 2 === 0 ? "bg-white" : "bg-gray-50"} text-[18px]`,
  };

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        setLoading(true);
        const token = await SecureStore.getItemAsync("authToken");
        if (!token) throw new Error("No authentication token found");
        const response = await fetch(
          "https://erp-production-72da01c8e651.herokuapp.com/api/mobile/projects",
          { headers: { Authorization: `Bearer ${token}` } }
        );
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.message || "Failed to fetch projects");
        setProjects(data || []);
      } catch (error) {
        Alert.alert("Error", error.message || "Failed to load projects.");
        console.error(error);
      } finally {
        setLoading(false);
      }
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchRfis();
      fetchContacts();
      setStage("modeSelection");
    }
  }, [selectedProject]);

  const fetchRfis = async () => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/rfis/${selectedProject._id}/rfis`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Failed to fetch RFIs");
      setRfis(data.data || data);
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to load RFIs.");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const fetchContacts = async () => {
    try {
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/contacts/by-account?accountId=${selectedProject.accountId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || "Failed to fetch contacts");
      setContacts(
        data.map((contact) => ({
          key: contact._id,
          value: `${contact.firstName} ${contact.lastName} (${contact.email})`,
        }))
      );
    } catch (error) {
      Alert.alert("Error", error.message || "Failed to load contacts.");
      console.error(error);
    }
  };

  const handleCreateToggle = () => {
    setIsCreating(!isCreating);
    setIsEditing(false);
    setEditingId(null);
    setNewRfi({
      rfiTitle: "",
      references: "",
      status: "open",
      customerContacts: [],
      questions: [],
    });
    setShowQuestionInput(false);
    setQuestionInput({
      questionTitle: "",
      questionBody: "",
      answer: "",
      imageAttachment: null,
    });
    setEditingQuestionIndex(null);
  };

  const handleEdit = (rfi) => {
    setIsEditing(true);
    setIsCreating(true);
    setEditingId(rfi._id);
    const selectedContacts = contacts.filter((c) =>
      rfi.customerContacts?.map((contact) => contact._id).includes(c.key)
    );
    setNewRfi({
      rfiTitle: rfi.rfiTitle || rfi.title || "",
      references: rfi.references || "",
      status: rfi.status || "open",
      customerContacts: selectedContacts,
      questions: rfi.questions?.length
        ? rfi.questions.map((q) => ({
            questionTitle: q.questionTitle || q.title || "",
            questionBody: q.questionBody || q.question || "",
            answer: q.answer || "",
            imageAttachment: q.imageAttachment?.url || null,
          }))
        : [],
    });
  };

  const handleDelete = (rfiId) => {
    Alert.alert("Confirm Delete", "Are you sure you want to delete this RFI?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            setLoading(true);
            const token = await SecureStore.getItemAsync("authToken");
            const response = await fetch(
              `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/rfis/${selectedProject._id}/rfis/${rfiId}`,
              {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` },
              }
            );
            const data = await response.json();
            if (!response.ok)
              throw new Error(data.message || "Failed to delete RFI");
            setRfis((prev) => prev.filter((item) => item._id !== rfiId));
            Alert.alert("Success", "RFI deleted successfully");
          } catch (error) {
            Alert.alert("Error", error.message || "Failed to delete RFI");
            console.error(error);
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  };

  const handleAddOrUpdateQuestion = () => {
    if (!questionInput.questionTitle || !questionInput.questionBody) {
      Alert.alert("Error", "Question title and body are required.");
      return;
    }
    setNewRfi((prev) => {
      const updatedQuestions = [...prev.questions];
      if (editingQuestionIndex !== null) {
        updatedQuestions[editingQuestionIndex] = { ...questionInput };
      } else {
        updatedQuestions.push({ ...questionInput });
      }
      return { ...prev, questions: updatedQuestions };
    });
    setQuestionInput({
      questionTitle: "",
      questionBody: "",
      answer: "",
      imageAttachment: null,
    });
    setShowQuestionInput(false);
    setEditingQuestionIndex(null);
  };

  const handleEditQuestion = (index) => {
    setQuestionInput({ ...newRfi.questions[index] });
    setEditingQuestionIndex(index);
    setShowQuestionInput(true);
  };

  const removeQuestion = (index) => {
    setNewRfi((prev) => ({
      ...prev,
      questions: prev.questions.filter((_, i) => i !== index),
    }));
  };

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: false,
    });

    if (!result.canceled) {
      setQuestionInput((prev) => ({
        ...prev,
        imageAttachment: result.assets[0].uri,
      }));
    }
  };

  const handleSubmit = async () => {
    if (!newRfi.rfiTitle) {
      Alert.alert("Error", "Please provide an RFI title.");
      return;
    }
    if (newRfi.questions.length === 0) {
      Alert.alert("Error", "Please add at least one question.");
      return;
    }
    if (newRfi.questions.some((q) => !q.questionTitle || !q.questionBody)) {
      Alert.alert("Error", "All questions must have a title and body.");
      return;
    }

    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const formData = new FormData();
      formData.append("rfiTitle", newRfi.rfiTitle);
      formData.append("references", newRfi.references);
      formData.append("status", newRfi.status);
      formData.append(
        "customerContacts",
        JSON.stringify(newRfi.customerContacts.map((c) => c.key))
      );
      formData.append(
        "questions",
        JSON.stringify(
          newRfi.questions.map((q) => ({
            questionTitle: q.questionTitle,
            questionBody: q.questionBody,
            answer: q.answer,
            existingImageAttachment:
              q.imageAttachment && !q.imageAttachment.startsWith("file://")
                ? q.imageAttachment
                : null,
          }))
        )
      );

      newRfi.questions.forEach((question, index) => {
        if (
          question.imageAttachment &&
          question.imageAttachment.startsWith("file://")
        ) {
          formData.append("attachments", {
            uri: question.imageAttachment,
            type: "image/jpeg",
            name: `image_${index}.jpg`,
          });
        }
      });

      const url = isEditing
        ? `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/rfis/${selectedProject._id}/rfis/${editingId}`
        : `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/rfis/${selectedProject._id}/rfis`;

      const method = isEditing ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || `Failed to ${isEditing ? "update" : "create"} RFI`
        );

      if (isEditing) {
        setRfis((prev) =>
          prev.map((item) =>
            item._id === editingId ? data.data || data : item
          )
        );
      } else {
        setRfis((prev) => [...prev, data.data || data]);
      }

      handleCreateToggle();
      Alert.alert(
        "Success",
        `RFI ${isEditing ? "updated" : "created"} successfully`
      );
    } catch (error) {
      Alert.alert(
        "Error",
        error.message || `Failed to ${isEditing ? "update" : "create"} RFI`
      );
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const generateRFIPDF = async (rfi) => {
    try {
      setLoading(true);
      const token = await SecureStore.getItemAsync("authToken");
      const response = await fetch(
        `https://erp-production-72da01c8e651.herokuapp.com/api/mobile/rfis/${selectedProject._id}/rfis/${rfi._id}/generate-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to generate PDF");
      }

      // Get the PDF blob
      const pdfBlob = await response.blob();
      if (pdfBlob.size === 0) {
        throw new Error("Received empty PDF blob");
      }
      if (pdfBlob.type !== "application/pdf") {
        throw new Error(`Unexpected blob type: ${pdfBlob.type}`);
      }

      // Define file path
      const fileName = `RFI_${rfi.rfiNumber || "document"}.pdf`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      // Convert blob to base64 and write to file
      const reader = new FileReader();
      const base64Promise = new Promise((resolve, reject) => {
        reader.onload = () => {
          if (typeof reader.result === "string") {
            resolve(reader.result);
          } else {
            reject(new Error("Failed to read blob as data URL"));
          }
        };
        reader.onerror = () => reject(new Error("FileReader error"));
        reader.readAsDataURL(pdfBlob);
      });

      const dataUrl = await base64Promise;
      const base64Data = dataUrl.split(",")[1];
      if (!base64Data) {
        throw new Error("Failed to extract base64 data from blob");
      }

      await FileSystem.writeAsStringAsync(filePath, base64Data, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("Failed to write PDF file");
      }

      // Extract email addresses from customerContacts
      const recipientEmails = rfi.customerContacts
        ? rfi.customerContacts
            .map((contact) => {
              try {
                if (contact.value) {
                  const emailMatch = contact.value.match(/\(([^)]+)\)/);
                  return emailMatch ? emailMatch[1] : "";
                }
                if (contact.email) {
                  return contact.email;
                }
                return "";
              } catch (err) {
                console.error(`Error processing contact:`, err);
                return "";
              }
            })
            .filter((email) => email)
        : [];

      // Construct mailto URL
      const subject = encodeURIComponent(
        `RFI #${rfi.rfiNumber}: ${rfi.rfiTitle}`
      );
      const body = encodeURIComponent(
        `Please find attached the RFI document for ${selectedProject.projectName}.`
      );
      const recipients = recipientEmails.join(",");
      const attachmentPath = filePath.replace(/^file:\/\//, "");

      // Note: mailto does not reliably support attachments, so we'll inform the user to attach manually
      const mailtoUrl = `mailto:${recipients}?subject=${subject}&body=${body}`;

      // Attempt to open mailto link
      const canOpen = await Linking.canOpenURL(mailtoUrl);
      if (canOpen) {
        await Linking.openURL(mailtoUrl);
        Alert.alert(
          "Email Client Opened",
          "Please manually attach the PDF from: " + attachmentPath
        );
      } else {
        console.log("Cannot open mailto URL, falling back to sharing");
        await sharePDF(filePath, fileName, rfi);
      }

      // Clean up
      await FileSystem.deleteAsync(filePath);
    } catch (error) {
      console.error("Error in generateRFIPDF:", error);
      Alert.alert("Error", error.message || "Failed to generate or share PDF");
    } finally {
      setLoading(false);
    }
  };

  const sharePDF = async (filePath, fileName, rfi) => {
    try {
      // Verify file exists
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (!fileInfo.exists) {
        throw new Error("PDF file not found for sharing");
      }

      // Check if sharing is available
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        throw new Error("Sharing is not available on this device");
      }

      console.log("Sharing PDF:", filePath);
      await Sharing.shareAsync(filePath, {
        mimeType: "application/pdf",
        dialogTitle: `Share RFI #${rfi.rfiNumber}: ${rfi.rfiTitle}`,
        UTI: "com.adobe.pdf", // iOS-specific
      });
      console.log("Sharing dialog triggered");
    } catch (error) {
      console.error("Error sharing PDF:", error);
      Alert.alert("Error", "Failed to share PDF: " + error.message);
    }
  };

  if (loading) {
    return (
      <View style={tw`flex-1 justify-center items-center bg-gray-50`}>
        <Text style={tw`text-[24px] text-gray-900 mb-6`}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={tw`flex-1 bg-gray-50 p-6`}>
      <ScrollView
        ref={scrollViewRef}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {stage === "selectProject" && (
          <>
            <Text
              style={tw`text-[28px] font-bold text-gray-900 mb-8 text-center`}
            >
              Select Project
            </Text>
            {projects.length === 0 ? (
              <Text style={tw`text-[18px] text-gray-500 text-center`}>
                No projects available
              </Text>
            ) : (
              projects.map((project) => (
                <TouchableOpacity
                  key={project._id}
                  style={tw`bg-white rounded-lg p-5 mb-5 shadow-md flex-row items-center`}
                  onPress={() => setSelectedProject(project)}
                >
                  <View
                    style={tw`w-12 h-12 bg-gray-200 rounded-full justify-center items-center mr-4`}
                  >
                    <FontAwesome name="building" size={24} color="gray" />
                  </View>
                  <Text style={tw`text-[18px] text-gray-900 flex-1`}>
                    {project.projectName}
                  </Text>
                </TouchableOpacity>
              ))
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mt-6 border border-gray-200 shadow-md`}
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

        {stage === "modeSelection" && !isCreating && (
          <>
            <Text
              style={tw`text-[28px] font-bold text-gray-900 mb-8 text-center`}
            >
              RFIs - {selectedProject.projectName}
            </Text>
            <TouchableOpacity
              style={tw`flex-row items-center bg-indigo-600 rounded-full p-4 mb-8 shadow-md`}
              onPress={handleCreateToggle}
            >
              <LinearGradient
                colors={["#4f46e5", "#7c3aed"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="plus" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-white font-semibold flex-1`}>
                Create New RFI
              </Text>
            </TouchableOpacity>
            {rfis.length === 0 ? (
              <Text style={tw`text-[18px] text-gray-500 text-center mb-6`}>
                No RFIs available
              </Text>
            ) : (
              rfis.map((rfi) => (
                <View
                  key={rfi._id}
                  style={tw`bg-white rounded-lg p-5 mb-5 shadow-md`}
                >
                  <Text
                    style={tw`text-[18px] text-gray-900 font-semibold mb-2`}
                  >
                    RFI #{rfi.rfiNumber}: {rfi.rfiTitle || rfi.title}
                  </Text>
                  <Text style={tw`text-[16px] text-gray-700`}>
                    Questions: {rfi.questions?.length || 0}
                  </Text>
                  <Text style={tw`text-[16px] text-gray-700`}>
                    Status:{" "}
                    {rfi.status.charAt(0).toUpperCase() + rfi.status.slice(1)}
                  </Text>
                  <Text style={tw`text-[16px] text-gray-700 mt-1`}>
                    Created by: {rfi.createdBy?.displayName || "Unknown"}
                  </Text>
                  <Text style={tw`text-[16px] text-gray-700 mt-1`}>
                    Contacts:{" "}
                    {rfi.customerContacts
                      ?.map((c) => `${c.firstName} ${c.lastName}`)
                      .join(", ") || "N/A"}
                  </Text>
                  <View style={tw`flex-row mt-3 flex-wrap`}>
                    <TouchableOpacity
                      style={tw`mr-4 mb-2`}
                      onPress={() => handleEdit(rfi)}
                    >
                      <Text style={tw`text-[16px] text-indigo-600 font-medium`}>
                        Edit
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={tw`mr-4 mb-2`}
                      onPress={() => handleDelete(rfi._id)}
                    >
                      <Text style={tw`text-[16px] text-red-600 font-medium`}>
                        Delete
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={tw`mb-2`}
                      onPress={() => generateRFIPDF(rfi)}
                    >
                      <Text style={tw`text-[16px] text-green-600 font-medium`}>
                        Generate PDF
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            )}
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 mt-6 border border-gray-200 shadow-md`}
              onPress={() => {
                setSelectedProject(null);
                setStage("selectProject");
              }}
            >
              <LinearGradient
                colors={["#6b7280", "#9ca3af"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Back to Projects
              </Text>
            </TouchableOpacity>
          </>
        )}

        {isCreating && (
          <>
            <Text
              style={tw`text-[24px] font-bold text-gray-900 mb-8 text-center`}
            >
              {isEditing ? "Edit RFI" : "New RFI"}
            </Text>

            <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
              <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                Summary
              </Text>
              <Text style={tw`text-[16px] text-gray-700 mb-2`}>
                Title: {newRfi.rfiTitle || "Untitled"}
              </Text>
              <Text style={tw`text-[16px] text-gray-700 mb-2`}>
                Questions: {newRfi.questions.length}
              </Text>
              <Text style={tw`text-[16px] text-gray-700 mb-2`}>
                Contacts:{" "}
                {newRfi.customerContacts
                  .map((c) => c.value.split(" (")[0])
                  .join(", ") || "None"}
              </Text>
              <Text style={tw`text-[16px] text-gray-700`}>
                Status:{" "}
                {newRfi.status.charAt(0).toUpperCase() + newRfi.status.slice(1)}
              </Text>
            </View>

            <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
              <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                RFI Title
              </Text>
              <TextInput
                style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 text-[18px]`}
                value={newRfi.rfiTitle}
                onChangeText={(text) =>
                  setNewRfi((prev) => ({ ...prev, rfiTitle: text }))
                }
                placeholder="Enter RFI title"
                placeholderTextColor="#999"
              />
            </View>

            <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
              <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                References
              </Text>
              <TextInput
                style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 text-[18px]`}
                multiline
                numberOfLines={2}
                value={newRfi.references}
                onChangeText={(text) =>
                  setNewRfi((prev) => ({ ...prev, references: text }))
                }
                placeholder="Enter reference documents, IDs, or notes"
                placeholderTextColor="#999"
              />
            </View>

            {isEditing && (
              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  Status
                </Text>
                <SelectList
                  setSelected={(key) =>
                    setNewRfi((prev) => ({ ...prev, status: key }))
                  }
                  data={statusOptions}
                  placeholder="Select status"
                  defaultOption={statusOptions.find(
                    (opt) => opt.key === newRfi.status
                  )}
                  boxStyles={dropdownStyles.boxStyles}
                  inputStyles={dropdownStyles.inputStyles}
                  dropdownStyles={dropdownStyles.dropdownStyles}
                  dropdownItemStyles={(index) =>
                    dropdownStyles.dropdownItemStyles(index)
                  }
                />
              </View>
            )}

            <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
              <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                Customer Contacts
              </Text>
              <SelectList
                setSelected={(keys) => {
                  const selected = contacts.filter((c) => keys.includes(c.key));
                  setNewRfi((prev) => ({
                    ...prev,
                    customerContacts: selected,
                  }));
                }}
                data={contacts}
                placeholder="Select contacts"
                boxStyles={dropdownStyles.boxStyles}
                inputStyles={dropdownStyles.inputStyles}
                dropdownStyles={dropdownStyles.dropdownStyles}
                dropdownItemStyles={(index) =>
                  dropdownStyles.dropdownItemStyles(index)
                }
                maxHeight={200}
                multiple
                defaultOption={newRfi.customerContacts}
              />
            </View>

            <TouchableOpacity
              style={tw`bg-indigo-600 rounded-lg p-4 mb-4 shadow-md`}
              onPress={() => {
                setQuestionInput({
                  questionTitle: "",
                  questionBody: "",
                  answer: "",
                  imageAttachment: null,
                });
                setEditingQuestionIndex(null);
                setShowQuestionInput(true);
              }}
            >
              <Text
                style={tw`text-[18px] text-white font-semibold text-center`}
              >
                Add Question
              </Text>
            </TouchableOpacity>
            {showQuestionInput && (
              <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
                <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                  {editingQuestionIndex !== null
                    ? "Edit Question"
                    : "Add Question"}
                </Text>
                <TextInput
                  style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 mb-3 text-[18px]`}
                  value={questionInput.questionTitle}
                  onChangeText={(text) =>
                    setQuestionInput((prev) => ({
                      ...prev,
                      questionTitle: text,
                    }))
                  }
                  placeholder="Question Title"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 mb-3 text-[18px]`}
                  multiline
                  numberOfLines={3}
                  value={questionInput.questionBody}
                  onChangeText={(text) =>
                    setQuestionInput((prev) => ({
                      ...prev,
                      questionBody: text,
                    }))
                  }
                  placeholder="Question Body"
                  placeholderTextColor="#999"
                />
                <TextInput
                  style={tw`bg-gray-100 text-gray-900 p-4 rounded-lg border border-gray-300 mb-3 text-[18px]`}
                  multiline
                  numberOfLines={3}
                  value={questionInput.answer}
                  onChangeText={(text) =>
                    setQuestionInput((prev) => ({ ...prev, answer: text }))
                  }
                  placeholder="Answer (Internal Reference)"
                  placeholderTextColor="#999"
                />
                <TouchableOpacity
                  style={tw`bg-indigo-600 p-4 rounded-lg mb-3`}
                  onPress={pickImage}
                >
                  <Text
                    style={tw`text-[18px] text-white text-center font-semibold`}
                  >
                    Add Image
                  </Text>
                </TouchableOpacity>
                {questionInput.imageAttachment && (
                  <Image
                    source={{ uri: questionInput.imageAttachment }}
                    style={tw`w-24 h-24 rounded-lg mb-3`}
                  />
                )}
                <TouchableOpacity
                  style={tw`bg-green-600 p-4 rounded-lg`}
                  onPress={handleAddOrUpdateQuestion}
                >
                  <Text
                    style={tw`text-[18px] text-white text-center font-semibold`}
                  >
                    {editingQuestionIndex !== null ? "Update" : "Add"}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={tw`bg-white rounded-lg p-5 mb-6 shadow-md`}>
              <Text style={tw`text-[18px] font-semibold text-gray-900 mb-3`}>
                Questions
              </Text>
              {newRfi.questions.length === 0 ? (
                <Text style={tw`text-[16px] text-gray-500`}>
                  No questions added yet
                </Text>
              ) : (
                newRfi.questions.map((question, index) => (
                  <View
                    key={index}
                    style={tw`border border-gray-200 rounded-lg p-4 mb-3`}
                  >
                    <View
                      style={tw`flex-row justify-between items-center mb-2`}
                    >
                      <Text style={tw`text-[16px] text-gray-900 font-medium`}>
                        Question {index + 1}
                      </Text>
                      <View style={tw`flex-row`}>
                        <TouchableOpacity
                          style={tw`mr-4`}
                          onPress={() => handleEditQuestion(index)}
                        >
                          <Text style={tw`text-[14px] text-indigo-600`}>
                            Edit
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeQuestion(index)}>
                          <Text style={tw`text-[14px] text-red-600`}>
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={tw`text-[16px] text-gray-700 mb-1`}>
                      {question.questionTitle}
                    </Text>
                    <Text style={tw`text-[14px] text-gray-600`}>
                      {question.questionBody}
                    </Text>
                    {question.imageAttachment && (
                      <Image
                        source={{ uri: question.imageAttachment }}
                        style={tw`w-24 h-24 rounded-lg mt-2`}
                      />
                    )}
                  </View>
                ))
              )}
            </View>

            <TouchableOpacity
              style={tw`flex-row items-center bg-green-600 rounded-full p-4 mb-6 shadow-md`}
              onPress={handleSubmit}
            >
              <LinearGradient
                colors={["#10b981", "#34d399"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="paper-plane" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-white font-semibold flex-1`}>
                {isEditing ? "Update RFI" : "Save RFI"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={tw`flex-row items-center bg-white rounded-full p-4 border border-gray-200 shadow-md`}
              onPress={handleCreateToggle}
            >
              <LinearGradient
                colors={["#6b7280", "#9ca3af"]}
                style={tw`w-10 h-10 rounded-full justify-center items-center mr-3`}
              >
                <FontAwesome name="arrow-left" size={20} color="white" />
              </LinearGradient>
              <Text style={tw`text-[18px] text-gray-900 font-semibold flex-1`}>
                Cancel
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}
