"use client";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useLoginMutation } from "@/services/auth";
import { useAuth } from "@/services/auth/session";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { FormEvent } from "react";

/**
 * Login page — cookie-based auth. The login mutation invalidates `auth.me`, so
 * on success the session query re-resolves and we return home (the header flips
 * to Logout). No token is stored in JS; the backend sets httpOnly cookies.
 */
export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { isAuthenticated } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const login = useLoginMutation({
    onSuccess: () => router.replace("/"),
  });

  // Already signed in → no reason to show the form.
  useEffect(() => {
    if (isAuthenticated) router.replace("/");
  }, [isAuthenticated, router]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password });
  }

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("login.title")}</h1>

      <Card className="max-w-md">
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium">{t("login.email")}</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="username"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium">{t("login.password")}</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>

          <Button type="submit" block disabled={login.isPending}>
            {login.isPending ? t("login.submitting") : t("login.submit")}
          </Button>

          {login.isError && <p className="text-sm text-red-600">{login.error.message}</p>}
        </form>
      </Card>
    </section>
  );
}
