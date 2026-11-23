"use client";

import { useState } from "react";
import { Bell, Loader2, Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { NOTE_MAX_LENGTH, hasVisibleText } from "@/lib/inbox/notes";
import { TransferError, transferConversation } from "@/lib/inbox/transfer";

export interface TransferTarget {
  /** Conversa em que o membro foi escolhido (revisão: trocar de conversa com o diálogo aberto não pode transferir a outra). */
  conversationId: string;
  userId: string;
  name: string;
}

type TransferT = ReturnType<typeof useTranslations>;

/** Mensagem do toast para um erro de transferência, pelo tipo do erro. */
export function transferErrorMessage(t: TransferT, err: unknown): string {
  const kind = err instanceof TransferError ? err.kind : "unknown";
  switch (kind) {
    case "forbidden":
      return t("errorForbidden");
    case "viewer":
      return t("errorViewer");
    case "not_member":
      return t("errorNotMember");
    default:
      return t("errorUnknown");
  }
}

interface TransferDialogProps {
  conversationId: string;
  /** Membro escolhido no menu; null = diálogo fechado. */
  target: TransferTarget | null;
  /** O membro escolhido já é o responsável: só grava a nota (se houver). */
  isCurrentAssignee: boolean;
  onClose: () => void;
  onTransferred: (userId: string) => void;
}

/**
 * Spec 5.4: escolher um membro no menu de responsável abre este diálogo,
 * com observação interna opcional. Nota + troca vão juntas pela RPC
 * transfer_conversation (tudo ou nada).
 */
export function TransferDialog({
  conversationId,
  target,
  isCurrentAssignee,
  onClose,
  onTransferred,
}: TransferDialogProps) {
  // Enquanto envia, Esc / X / clique fora não fecham (a observação não se
  // perde se a transferência falhar).
  const [submitting, setSubmitting] = useState(false);
  const activeTarget = target && target.conversationId === conversationId ? target : null;
  return (
    <Dialog
      open={activeTarget !== null}
      onOpenChange={(open) => {
        if (!open && !submitting) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        {activeTarget && (
          // key: cada abertura começa com a observação vazia, sem efeito.
          <TransferForm
            key={`${conversationId}:${activeTarget.userId}`}
            conversationId={conversationId}
            target={activeTarget}
            submitting={submitting}
            setSubmitting={setSubmitting}
            isCurrentAssignee={isCurrentAssignee}
            onClose={onClose}
            onTransferred={onTransferred}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function TransferForm({
  conversationId,
  target,
  isCurrentAssignee,
  onClose,
  onTransferred,
  submitting,
  setSubmitting,
}: Omit<TransferDialogProps, "target"> & {
  target: TransferTarget;
  submitting: boolean;
  setSubmitting: (v: boolean) => void;
}) {
  const t = useTranslations("Inbox.transfer");
  const [note, setNote] = useState("");

  const hasNote = hasVisibleText(note);
  const tooLong = note.length > NOTE_MAX_LENGTH;
  // Mesmo responsável sem observação não faria nada no banco.
  const canSubmit = !submitting && !tooLong && (!isCurrentAssignee || hasNote);

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await transferConversation(createClient(), conversationId, target.userId, note);
      toast.success(
        isCurrentAssignee ? t("noteSaved") : t("transferred", { name: target.name }),
      );
      onTransferred(target.userId);
      onClose();
    } catch (err) {
      console.error("Failed to transfer conversation:", err);
      toast.error(transferErrorMessage(t, err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {isCurrentAssignee
            ? t("sameAssigneeTitle", { name: target.name })
            : t("title", { name: target.name })}
        </DialogTitle>
        {isCurrentAssignee && (
          <DialogDescription>{t("sameAssigneeHint", { name: target.name })}</DialogDescription>
        )}
      </DialogHeader>

      <div className="grid gap-2">
        <Label htmlFor="transfer-note">{t("noteLabel")}</Label>
        <Textarea
          id="transfer-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={NOTE_MAX_LENGTH}
          rows={4}
          placeholder={t("notePlaceholder")}
          disabled={submitting}
          className="resize-none"
        />
        <div className="flex items-start justify-between gap-2 text-[11px] text-muted-foreground">
          <div className="grid gap-1">
            <p className="flex items-center gap-1">
              <Lock className="h-3 w-3 shrink-0" aria-hidden />
              {t("privateHint")}
            </p>
            {!isCurrentAssignee && (
              <p className="flex items-center gap-1">
                <Bell className="h-3 w-3 shrink-0" aria-hidden />
                {t("notificationHint", { name: target.name })}
              </p>
            )}
          </div>
          <span className="shrink-0 tabular-nums" aria-live="polite">
            {note.length}/{NOTE_MAX_LENGTH}
          </span>
        </div>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={onClose} disabled={submitting}>
          {t("cancel")}
        </Button>
        <Button onClick={submit} disabled={!canSubmit}>
          {submitting && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" aria-hidden />}
          {submitting ? t("submitting") : isCurrentAssignee ? t("submitNote") : t("submit")}
        </Button>
      </DialogFooter>
    </>
  );
}
