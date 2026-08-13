"use client";

import { useTranslations } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { trialDaysRemaining } from "@/lib/trial";

export function TrialBanner() {
  const t = useTranslations("TrialBanner");
  const { account, profileLoading } = useAuth();

  if (profileLoading || account?.status !== "trial") return null;

  const days = trialDaysRemaining(account.renewal_date);
  if (days === null) return null;

  // Escalate color as the deadline gets close — plain muted while
  // there's a comfortable runway, amber inside a week, red on the
  // last day. Purely a visual nudge; middleware (not this component)
  // is what actually enforces the cutoff at 0.
  const urgency =
    days <= 1 ? "urgent" : days <= 3 ? "warning" : "default";

  const styles = {
    default: "border-border bg-muted/50 text-muted-foreground",
    warning:
      "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200",
    urgent:
      "border-red-500/30 bg-red-500/10 text-red-900 dark:text-red-200",
  }[urgency];

  return (
    <div
      className={`flex items-center justify-center gap-2 border-b px-4 py-2 text-sm ${styles}`}
    >
      <span aria-hidden>⏳</span>
      <span>
        {days === 0
          ? t("lastDay")
          : days === 1
            ? t("oneDayLeft")
            : t("daysLeft", { days })}
      </span>
      <a href="mailto:suporte@clientizza.com" className="ml-1 underline">
        {t("contactSupport")}
      </a>
    </div>
  );
}
