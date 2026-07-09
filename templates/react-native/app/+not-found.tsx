import { Text } from "@/components/ui/text";
import { Link, Stack } from "expo-router";
import { View } from "react-native";

/** Fallback for an unmatched route. */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Not found" }} />
      <View className="flex-1 items-center justify-center gap-4 bg-background p-6">
        <Text variant="title">This screen doesn't exist.</Text>
        <Link href="/">
          <Text variant="body" className="text-primary">
            Go to home
          </Text>
        </Link>
      </View>
    </>
  );
}
