import type { Conversation } from '@/types'
import { isFlowRunStale } from '@/lib/flows/fallback'

/**
 * Selos da lista do Inbox: "🤖 I.A atendendo" e "🤖 Fluxo em andamento".
 *
 * `aiHandlesConversation` é a regra que o auto-reply usa para decidir se
 * a I.A responde esta conversa (src/lib/ai/auto-reply.ts) — a mesma
 * função nos dois lados, para o selo nunca prometer o que a I.A não faz.
 */
export function aiHandlesConversation(args: {
  aiActive: boolean
  autoReplyEnabled: boolean
  autoRespondersActive: boolean
  // Aceita null: é o que o banco devolve (o tipo Conversation usa undefined).
  conversation: { [K in 'status' | 'assigned_agent_id' | 'ai_autoreply_disabled' | 'bot_handoff_at']?: Conversation[K] | null }
}): boolean {
  const c = args.conversation
  return (
    args.aiActive &&
    args.autoReplyEnabled &&
    !args.autoRespondersActive &&
    c.status !== 'closed' && // encerrada não é atendida (o cliente escrevendo reabre antes — 059)
    !c.assigned_agent_id && // um humano é o responsável
    !c.ai_autoreply_disabled && // pausada à mão ou depois de um handoff
    !c.bot_handoff_at // D7: robôs em silêncio até encerrar/reabrir
  )
}

/** Conversas com execução de fluxo ativa e não vencida (mesma regra F8/D11 do runner). */
export function activeFlowConversationIds(
  runs: { conversation_id: string | null; last_advanced_at: string; fallback_policy: unknown }[],
  now: Date,
): Set<string> {
  const ids = new Set<string>()
  for (const r of runs) {
    if (!r.conversation_id) continue
    if (isFlowRunStale(r.last_advanced_at, r.fallback_policy, now)) continue
    ids.add(r.conversation_id)
  }
  return ids
}

/** Um selo por conversa; fluxo em andamento tem prioridade sobre a I.A. */
export function conversationBadge(args: { inActiveFlow: boolean; aiHandles: boolean }): 'flow' | 'ai' | null {
  if (args.inActiveFlow) return 'flow'
  if (args.aiHandles) return 'ai'
  return null
}
