"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useTranslation } from "react-i18next";

/** Home page — stack description + dialog demo. Header/nav + page shell live in `app/layout.tsx`. */
export default function HomePage() {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="mb-3 text-3xl font-bold">{t("home.welcome")} 👋</h1>
      <p className="mb-6 text-muted-foreground">{t("home.description")}</p>
      <Dialog>
        <DialogTrigger asChild>
          <Button>{t("home.open_dialog")}</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hello from shadcn/ui</DialogTitle>
            <DialogDescription>Headless components — bring your own styles.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="secondary" size="sm">
                Close
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
