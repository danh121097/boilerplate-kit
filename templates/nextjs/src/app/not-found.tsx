"use client";

import { useTranslation } from "react-i18next";
import Link from "next/link";

/** Not-found page — rendered inside the root layout for any unmatched URL and for `notFound()`. */
export default function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="mb-3 text-3xl font-bold">{t("not_found.title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("not_found.description")}</p>
      <Link href="/" className="font-medium underline hover:text-primary">
        {t("not_found.back_home")}
      </Link>
    </section>
  );
}
