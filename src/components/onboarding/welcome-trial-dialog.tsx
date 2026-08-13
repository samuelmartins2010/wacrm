"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trialDaysRemaining } from "@/lib/trial";

export function WelcomeTrialDialog() {
  const t = useTranslations("WelcomeDialog");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { account } = useAuth();

  // Derived once from the initial search params instead of synced via
  // an effect — we only care about the value at mount time (right
  // after the OAuth redirect lands), not about reacting to it
  // changing later in the session.
  const [open, setOpen] = useState(() => searchParams.get("welcome") === "1");

  const handleClose = () => {
    setOpen(false);
    // Strip ?welcome=1 so a manual refresh doesn't show this again.
    const params = new URLSearchParams(searchParams.toString());
    params.delete("welcome");
    const query = params.toString();
    router.replace(query ? `?${query}` : window.location.pathname);
  };

  const days = trialDaysRemaining(account?.renewal_date ?? null);

  return (
    <Dialog open={open} onOpenChange={(next) => !next && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl">{t("title")}</DialogTitle>
          <DialogDescription>{t("subtitle")}</DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-2.5 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span aria-hidden>💬</span>
            {t("feature1")}
          </li>
          <li className="flex gap-2">
            <span aria-hidden>📇</span>
            {t("feature2")}
          </li>
          <li className="flex gap-2">
            <span aria-hidden>🤖</span>
            {t("feature3")}
          </li>
        </ul>

        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-900 dark:text-amber-200">
          {days !== null
            ? t("trialNotice", { days })
            : t("trialNoticeGeneric")}
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            {t("cta")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
