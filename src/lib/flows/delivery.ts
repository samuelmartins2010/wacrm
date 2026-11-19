import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * F6: Meta accepted a flow message and reported the failure later through
 * the status webhook (e.g. 131053 media download failed). Record it on the
 * run that sent it so it shows in /flows/[id]/runs. Returns whether the
 * message belonged to a flow run.
 */
export async function recordFlowDeliveryFailure(
  db: SupabaseClient,
  whatsappMessageId: string,
  error: { code?: number | null; message?: string | null } | null,
): Promise<boolean> {
  const { data } = await db
    .from("flow_run_events")
    .select("flow_run_id, node_key")
    .eq("event_type", "message_sent")
    .filter("payload->>whatsapp_message_id", "eq", whatsappMessageId)
    .limit(1);
  const sent = (Array.isArray(data) ? data[0] : null) as { flow_run_id: string; node_key: string | null } | null;
  if (!sent) return false;
  await db.from("flow_run_events").insert({
    flow_run_id: sent.flow_run_id,
    event_type: "error",
    node_key: sent.node_key,
    payload: {
      reason: "delivery_failed",
      whatsapp_message_id: whatsappMessageId,
      code: error?.code ?? null,
      detail: error?.message ?? null,
    },
  });
  return true;
}
