import { useAuth, useLoginMutation } from "@/services/auth";
import { createFileRoute } from "@tanstack/react-router";
import type { FormEvent } from "react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

/**
 * Login page — cookie-based auth. The login mutation invalidates `auth.me`, so
 * on success the session query re-resolves and we return home (the header flips
 * to Logout). No token is stored in JS; the backend sets httpOnly cookies.
 */
function LoginPage() {
  const navigate = useNavigate();

  const login = useLoginMutation({
    onSuccess: () => navigate({ to: "/" }),
  });

  const { t } = useTranslation();
  const { isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Already signed in → no reason to show the form.
  useEffect(() => {
    if (isAuthenticated) navigate({ to: "/" });
  }, [isAuthenticated, navigate]);

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
