import type { ConversationEvent, Message } from '@/types'

/**
 * Linha do tempo da conversa: mensagens + eventos de conversation_events
 * (notas internas, trocas de responsável, reabertura).
 */
export type TimelineItem =
  | { kind: 'message'; at: string; message: Message }
  | { kind: 'event'; at: string; event: ConversationEvent }

/**
 * Junta mensagens e eventos em ordem de hora. No empate, mensagem antes de
 * evento. A observação de uma transferência (a nota apontada por `note_id`)
 * vem logo depois da linha de troca — no banco ela é gravada antes, na
 * mesma transação. Eventos repetidos (carga + tempo real) aparecem uma vez.
 */
export function mergeTimeline(messages: Message[], events: ConversationEvent[]): TimelineItem[] {
  const unique = new Map<string, ConversationEvent>()
  for (const e of events) if (!unique.has(e.id)) unique.set(e.id, e)

  // Notas que pertencem a uma troca presente: saem da ordem normal e são
  // encaixadas depois da troca.
  const attached = new Map<string, ConversationEvent>()
  for (const e of unique.values()) {
    if (e.note_id) {
      const note = unique.get(e.note_id)
      if (note) attached.set(e.id, note)
    }
  }
  const attachedNoteIds = new Set([...attached.values()].map((n) => n.id))

  const items: TimelineItem[] = [
    ...messages.map((m) => ({ kind: 'message' as const, at: m.created_at, message: m })),
    ...[...unique.values()]
      .filter((e) => !attachedNoteIds.has(e.id))
      .map((e) => ({ kind: 'event' as const, at: e.created_at, event: e })),
  ]

  const time = (s: string) => {
    const t = Date.parse(s)
    return Number.isFinite(t) ? t : 0
  }
  // sort estável: dentro do mesmo tipo e hora, mantém a ordem de chegada
  items.sort((a, b) => time(a.at) - time(b.at) || (a.kind === b.kind ? 0 : a.kind === 'message' ? -1 : 1))

  const out: TimelineItem[] = []
  for (const item of items) {
    out.push(item)
    if (item.kind === 'event') {
      const note = attached.get(item.event.id)
      if (note) out.push({ kind: 'event', at: note.created_at, event: note })
    }
  }
  return out
}
