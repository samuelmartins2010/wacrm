import type { SupabaseClient } from "@supabase/supabase-js";
import { pingAutomationEvents } from "@/lib/automations/ping";
import { normalizeNote } from "@/lib/inbox/notes";

/** Só o que a transferência usa do cliente Supabase (facilita o teste). */
export type TransferClient = Pick<SupabaseClient, "rpc">;

export type TransferErrorKind = "forbidden" | "viewer" | "not_member" | "unknown";

/** Erro da RPC transfer_conversation, já classificado para a tela traduzir. */
export class TransferError extends Error {
  readonly kind: TransferErrorKind;
  readonly code?: string;

  constructor(kind: TransferErrorKind, message: string, code?: string) {
    super(message);
    this.name = "TransferError";
    this.kind = kind;
    this.code = code;
  }
}

function classify(error: { code?: string; message?: string }): TransferErrorKind {
  const message = error.message ?? "";
  if (error.code === "42501") return "forbidden";
  if (error.code === "22023") {
    if (message.includes("view-only")) return "viewer";
    if (message.includes("not a member")) return "not_member";
  }
  return "unknown";
}

/**
 * Troca o responsável pela RPC transfer_conversation (nota + evento + troca
 * na mesma transação). `toUserId = null` remove o responsável. Observação
 * vazia ou só com espaços/invisíveis vai como null.
 */
export async function transferConversation(
  supabase: TransferClient,
  conversationId: string,
  toUserId: string | null,
  note: string,
): Promise<void> {
  const { error } = await supabase.rpc("transfer_conversation", {
    p_conversation_id: conversationId,
    p_to_user_id: toUserId,
    p_note: normalizeNote(note),
  });
  if (error) {
    throw new TransferError(classify(error), error.message ?? "transfer failed", error.code);
  }
  if (toUserId) pingAutomationEvents(); // D3: conversation_assigned
}
