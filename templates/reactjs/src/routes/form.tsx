import { zodResolver } from "@hookform/resolvers/zod";
import { createFileRoute } from "@tanstack/react-router";
import { useForm } from "react-hook-form";
import { z } from "zod";

export const Route = createFileRoute("/form")({
  component: FormPage,
});

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

function FormPage() {
  const { t } = useTranslation();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

  const [success, setSuccess] = useState(false);

  const onSubmit = handleSubmit(() => {
    setSuccess(true);
  });

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("form.title")}</h1>

      <Card className="max-w-md">
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField
            label={t("form.email")}
            type="email"
            placeholder="you@example.com"
            error={errors.email?.message}
            {...register("email")}
          />

          <FormField
            label={t("form.password")}
            type="password"
            error={errors.password?.message}
            {...register("password")}
          />

          <Button type="submit" block>
            {t("form.submit")}
          </Button>

          {success && <Badge variant="success">{t("form.success")}</Badge>}
        </form>
      </Card>
    </section>
  );
}
