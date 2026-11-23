"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { NOTE_MAX_LENGTH, hasVisibleText } from "@/lib/inbox/notes";

/**
 * Aba "Nota interna" do composer: só texto, fundo amarelo, sem anexo,
 * modelo, resposta rápida ou interativo. Enter quebra linha (não salva),
 * para não salvar sem querer; só o botão salva.
 */
export function NoteComposer({ onSave }: { onSave: (body: string) => Promise<boolean> }) {
  const t = useTranslations("Inbox.composer");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const canSave = hasVisibleText(body) && body.length <= NOTE_MAX_LENGTH && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await onSave(body);
    setSaving(false);
    if (ok) setBody("");
  };

  return (
    <div className="border-t border-amber-300/60 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        maxLength={NOTE_MAX_LENGTH}
        rows={3}
        placeholder={t("notePlaceholder")}
        aria-label={t("tabNote")}
        className="w-full resize-none rounded-md border border-amber-300/70 bg-white/80 px-3 py-2 text-sm text-foreground outline-none focus:border-amber-500 dark:border-amber-500/40 dark:bg-background/40"
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1 text-[11px] text-amber-800 dark:text-amber-300">
          <Lock className="h-3 w-3" aria-hidden />
          {t("noteHint")}
          <span className="tabular-nums text-amber-700/70 dark:text-amber-300/70">
            · {body.length}/{NOTE_MAX_LENGTH}
          </span>
        </p>
        <Button size="sm" onClick={save} disabled={!canSave}>
          {t("saveNote")}
        </Button>
      </div>
    </div>
  );
}
