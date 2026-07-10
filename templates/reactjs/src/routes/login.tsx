import { useLoginMutation } from "@/services/auth/auth";
import { useAuthStore } from "@/stores/auth";
import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/login")({
  // Carry the page the guard bounced the user away from, so we can return to it.
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  // Guests only: an authenticated user hitting /login is sent home.
  beforeLoad: () => {
    if (useAuthStore.getState().isAuthenticated) {
      throw redirect({ to: "/" });
    }
  },
  component: LoginPage,
});

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

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
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const [error, setError] = useState("");

  const onSubmit = handleSubmit(async (values) => {
    setError("");
    try {
      const result = await mutateAsync(values);
      setUser(result.user);
      await navigate({ to: redirectTo ?? "/" });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("login.error"));
    }
  });

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("login.title")}</h1>

      <Card className="max-w-md">
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField
            label={t("login.email")}
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <FormField
            label={t("login.password")}
            type="password"
            error={errors.password?.message}
            {...register("password")}
          />

          <Button type="submit" block disabled={isPending}>
            {isPending ? t("login.submitting") : t("login.submit")}
          </Button>

          {error && <Badge variant="danger">{error}</Badge>}
        </form>
      </Card>
    </section>
  );
}
