import { useAuth, useLoginMutation } from "@/services/auth";
import { loginSchema, type LoginFormValues } from "@/services/auth/login-schema";
import { getApiErrorMessage } from "@/services/core/api-errors";
import { redirectIfSignedIn } from "@/services/core/route-guard";
import { safeRedirect } from "@/services/core/session";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import type { FormEvent } from "react";

export const Route = createFileRoute("/login")({
  // The page a guard or an expired session bounced the user away from, to return to.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  // Guests only: a signed-in user is sent on to the safe `redirect` target (or home).
  beforeLoad: ({ search }) => redirectIfSignedIn(search),
  component: LoginPage,
});

/**
 * Login page — cookie-based auth. The login mutation invalidates `auth.me`, so
 * on success the session query re-resolves and we return to `?redirect=` when it
 * is a same-origin path, else home (the header flips to Logout). No token is
 * stored in JS; the backend sets httpOnly cookies.
 */
function LoginPage() {
  const navigate = useNavigate();

  const { redirect: redirectTo } = Route.useSearch();

  const returnTo = safeRedirect(redirectTo);

  const login = useLoginMutation({
    onSuccess: () => navigate({ href: returnTo }),
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
    if (isAuthenticated) void navigate({ href: returnTo });
  }, [isAuthenticated, navigate, returnTo]);

  const submit = handleSubmit((values) => login.mutate(values));

  // Clear the previous server error first: a submit that fails client validation
  // never reaches the mutation, so its stale alert would otherwise stay visible.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    login.reset();
    return submit(event);
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
