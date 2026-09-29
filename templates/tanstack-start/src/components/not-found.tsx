/** Root `notFoundComponent`: rendered inside the layout for any unmatched URL. */
export function NotFound() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="mb-3 text-3xl font-bold">{t("not_found.title")}</h1>
      <p className="mb-6 text-muted-foreground">{t("not_found.description")}</p>
      <Link to="/" className="font-medium underline hover:text-primary">
        {t("not_found.back_home")}
      </Link>
    </section>
  );
}
