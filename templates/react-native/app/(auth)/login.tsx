import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useLoginMutation } from "@/services/auth";
import { useAuthStore } from "@/stores/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const setUser = useAuthStore((s) => s.setUser);

  const { t } = useTranslation();
  const { isPending, mutateAsync } = useLoginMutation();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const [failed, setFailed] = useState(false);

  const onSubmit = handleSubmit(async (values) => {
    setFailed(false);
    try {
      const result = await mutateAsync(values);
      setUser(result.user);
      router.replace("/");
    } catch {
      setFailed(true);
    }
  });

  return (
    <SafeAreaView className="flex-1 bg-background">
      <KeyboardAvoidingView
        className="flex-1 justify-center px-6"
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text variant="heading" className="mb-6">
          {t("login.title")}
        </Text>

        <Card className="gap-4">
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t("login.email")}
                testID="login-email"
                autoCapitalize="none"
                keyboardType="email-address"
                placeholder="you@example.com"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />

          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label={t("login.password")}
                testID="login-password"
                secureTextEntry
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />

          {failed ? (
            <Text variant="error" testID="login-error">
              {t("login.failed")}
            </Text>
          ) : null}

          <Button block loading={isPending} onPress={onSubmit} testID="login-submit">
            {t("login.submit")}
          </Button>
        </Card>

        <View className="h-8" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
