// components/Button.js
import React from "react";
import { Text } from "react-native";

export default function Button({ title, onPress }) {
  return (
    <Text
      onPress={onPress}
      style={{
        backgroundColor: "#0000ff",
        color: "#fff",
        padding: 10,
        borderRadius: 5,
      }}
    >
      {title}
    </Text>
  );
}
