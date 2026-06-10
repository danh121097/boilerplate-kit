"use client";

import { useTranslation } from "react-i18next";

/** Home page — stack description. Header/nav + page shell live in `app/layout.tsx`. */
export default function HomePage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="mb-3 text-3xl font-bold">{t("home.welcome")} 👋</h1>
      <p className="mb-6 text-gray-600">{t("home.description")}</p>
    </section>
  );
}
