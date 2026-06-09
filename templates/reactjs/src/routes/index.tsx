import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="mb-3 text-3xl font-bold">{t("home.welcome")} 👋</h1>
      <p className="mb-6 text-gray-600">{t("home.description")}</p>
    </section>
  );
}
