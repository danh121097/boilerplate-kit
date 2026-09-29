import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Text } from "@/components/ui/text";
import { useLoginMutation } from "@/services/auth";
import { getApiErrorMessage, safeRedirect } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { KeyboardAvoidingView, Platform, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { z } from "zod";
import type { Href } from "expo-router";

// Messages are i18n keys, translated where they are rendered.
const schema = z.object({
  email: z.email("validation.email"),
  password: z.string().min(8, "validation.password_min"),
});

type FormValues = z.infer<typeof schema>;

export default function LoginScreen() {
  const setUser = useAuthStore((s) => s.setUser);

  const { t } = useTranslation();
  const { isPending, mutateAsync } = useLoginMutation();
  // Set by the auth gate for a guest on a protected screen; validated (in-app paths only).
  const { redirect } = useLocalSearchParams<{ redirect?: string }>();

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const [error, setError] = useState("");

  const submitValid = handleSubmit(async (values) => {
    try {
      const result = await mutateAsync(values);
      setUser(result.user);
      router.replace(safeRedirect(redirect) as Href);
    } catch (err) {
      // Rejections are `ApiResponseError` objects: show the server's message.
      setError(getApiErrorMessage(err, t("login.error")));
    }
  });

  // Clear the previous server error before validating, so it does not linger
  // when the next attempt fails client-side validation.
  const onSubmit = () => {
    setError("");
    return submitValid();
  };

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
                autoComplete="username"
                textContentType="username"
                placeholder="you@example.com"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message ? t(errors.email.message) : undefined}
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
                autoComplete="current-password"
                textContentType="password"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message ? t(errors.password.message) : undefined}
              />
            )}
          />

          {error ? (
            <Text variant="error" accessibilityRole="alert" testID="login-error">
              {error}
            </Text>
          ) : null}

          <Button block loading={isPending} onPress={onSubmit} testID="login-submit">
            {isPending ? t("login.submitting") : t("login.submit")}
          </Button>
        </Card>

        <View className="h-8" />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
