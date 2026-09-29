import { useLoginMutation } from "@/services/auth/auth";
import { loginSchema, type LoginFormValues } from "@/services/auth/login-schema";
import { getApiErrorMessage, safeRedirect } from "@/services/core";
import { useAuthStore } from "@/stores/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";

export const Route = createFileRoute("/login")({
  // Carry the page the guard bounced the user away from, so we can return to it.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  // Guests only: an authenticated user hitting /login is sent on (or home).
  beforeLoad: ({ search }) => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ href: safeRedirect(search.redirect) });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const setUser = useAuthStore((s) => s.setUser);

  const { t } = useTranslation();
  const { redirect: redirectTo } = Route.useSearch();
  const { isPending, mutateAsync } = useLoginMutation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const [error, setError] = useState("");

  const submit = handleSubmit(async (values) => {
    try {
      const result = await mutateAsync(values);
      setUser(result.user);
      // Same-origin paths only — never an open redirect to another site.
      await navigate({ href: safeRedirect(redirectTo) });
    } catch (err) {
      // Rejections are `ApiResponseError` objects: show the server's message.
      setError(getApiErrorMessage(err, t("login.error")));
    }
  });

  // Drop the previous server error first, so it cannot outlive a submit that fails validation.
  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    setError("");
    return submit(event);
  }

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("login.title")}</h1>

      <Card className="max-w-md">
        <form className="space-y-4" onSubmit={onSubmit} noValidate>
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

          <Button type="submit" block disabled={isPending}>
            {isPending ? t("login.submitting") : t("login.submit")}
          </Button>

          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </form>
      </Card>
    </section>
  );
}
