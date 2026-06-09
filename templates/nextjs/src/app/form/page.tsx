"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { zodResolver } from "@hookform/resolvers/zod";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(8, "At least 8 characters"),
});

type FormValues = z.infer<typeof schema>;

/** Form page — client component, react-hook-form + zod validation. */
export default function FormPage() {
  const { t } = useTranslation();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
  });

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
