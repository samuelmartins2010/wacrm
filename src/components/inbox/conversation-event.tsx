"use client";

import { format } from "date-fns";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ConversationEvent } from "@/types";

/**
 * Um item de conversation_events na linha do tempo:
 *  - nota interna → cartão amarelo "🔒 Nota interna · <autor> · <hora>";
 *  - atribuição / transferência / remoção / reabertura → linha de sistema.
 * Só a equipe vê; nada disso vai para o cliente.
 */
export function ConversationEventItem({
  event,
  nameOf,
}: {
  event: ConversationEvent;
  /** Nome de um membro pelo user_id (ou null se não conhecido). */
  nameOf: (userId: string | null) => string | null;
}) {
  const t = useTranslations("Inbox.events");
  const time = format(new Date(event.created_at), "HH:mm");

  const actor = (() => {
    switch (event.actor_kind) {
      case "automation":
        return t("actorAutomation");
      case "flow":
        return t("actorFlow");
      case "ai":
        return t("actorAi");
      case "system":
        return t("actorSystem");
      case "customer":
        return t("actorCustomer");
      default:
        return nameOf(event.actor_user_id) ?? t("someone");
    }
  })();
  const person = (id: string | null) => nameOf(id) ?? t("removedMember");

  if (event.type === "note") {
    return (
      <div className="mx-auto w-full max-w-xl rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-amber-950 shadow-sm dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
        <p className="flex items-center gap-1 text-[11px] font-medium text-amber-800 dark:text-amber-300">
          <Lock className="h-3 w-3" aria-hidden />
          {t("noteHeader", { author: actor, time })}
        </p>
        <p className="mt-1 whitespace-pre-wrap break-words text-sm">{event.body}</p>
      </div>
    );
  }

  let text: string;
  switch (event.type) {
    case "assigned":
      text = t("assigned", { actor, to: person(event.to_user_id) });
      break;
    case "transferred":
      text = t("transferred", { actor, from: person(event.from_user_id), to: person(event.to_user_id) });
      break;
    case "unassigned":
      text =
        event.actor_kind === "system"
          ? t("unassignedBySystem", { from: person(event.from_user_id) })
          : t("unassigned", { actor, from: person(event.from_user_id) });
      break;
    case "reopened":
      text = t("reopened");
      break;
    default:
      return null;
  }

  return (
    <div className="flex items-center justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground">
        {text} · {time}
      </span>
    </div>
  );
}
