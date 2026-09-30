"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { useLoginMutation } from "@/services/auth";
import { loginSchema } from "@/services/auth/schema/login";
import { useAuth } from "@/services/auth/session";
import { getApiErrorMessage, safeRedirect } from "@/services/core";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { LoginFormValues } from "@/services/auth/schema/login";
import type { FormEvent } from "react";

/** Where to go after signing in: the same-origin `?redirect=` path (set when a
 * session expired), else home. Read at call time — `useSearchParams` would force
 * a Suspense boundary on this statically rendered page. */
function returnPath(): string {
  return safeRedirect(new URLSearchParams(window.location.search).get("redirect"));
}

/**
 * Login page — cookie-based auth. The login mutation invalidates `auth.me`, so
 * on success the session query re-resolves and we return to `?redirect=` (or
 * home; the header flips to Logout). No token is stored in JS; the backend sets
 * httpOnly cookies.
 */
export default function LoginPage() {
  const router = useRouter();

  const login = useLoginMutation({
    onSuccess: () => router.replace(returnPath()),
  });

  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  // Already signed in → no reason to show the form.
  useEffect(() => {
    if (isAuthenticated) router.replace(returnPath());
  }, [isAuthenticated, router]);

  // Reset first so a previous server error never outlives a new submit (even one
  // that fails client validation).
  const onSubmit = (e: FormEvent) => {
    login.reset();
    return handleSubmit((values) => login.mutate(values))(e);
  };

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("login.title")}</h1>

      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <FormField
            label={t("login.email")}
            type="email"
            placeholder="you@example.com"
            autoComplete="username"
            error={errors.email?.message && t(errors.email.message)}
            {...register("email")}
          />

          <FormField
            label={t("login.password")}
            type="password"
            autoComplete="current-password"
            error={errors.password?.message && t(errors.password.message)}
            {...register("password")}
          />

          <Button type="submit" block disabled={login.isPending}>
            {login.isPending ? t("login.submitting") : t("login.submit")}
          </Button>

          {login.isError && (
            <p role="alert" className="text-sm text-destructive">
              {getApiErrorMessage(login.error, t("login.error"))}
            </p>
          )}
        </form>
      </Card>
    </section>
  );
}
