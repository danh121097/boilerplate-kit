import { Button } from "@/components/ui/button";
import { useCounterStore } from "@/stores/counter";
import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/counter")({
  component: CounterPage,
});

function CounterPage() {
  const { t } = useTranslation();
  const { count, increment, decrement, reset } = useCounterStore();

  return (
    <section>
      <h1 className="mb-4 text-3xl font-bold">{t("counter.title")}</h1>
      <p className="mb-4 text-lg">
        {t("counter.count")}: <span className="font-mono">{count}</span>
      </p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={decrement}>
          −
        </Button>
        <Button variant="secondary" size="sm" onClick={increment}>
          +
        </Button>
        <Button variant="danger" size="sm" onClick={reset}>
          Reset
        </Button>
      </div>
    </section>
  );
}
