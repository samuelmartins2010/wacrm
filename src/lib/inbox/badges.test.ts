import { describe, expect, it } from 'vitest'
import { activeFlowConversationIds, aiHandlesConversation, conversationBadge } from './badges'

const base = {
  aiActive: true,
  autoReplyEnabled: true,
  autoRespondersActive: false,
  conversation: { assigned_agent_id: null, ai_autoreply_disabled: false, bot_handoff_at: null },
}

describe('aiHandlesConversation (mesma regra do auto-reply)', () => {
  it('I.A ligada, resposta automática ligada, sem automação de resposta e conversa livre → atende', () => {
    expect(aiHandlesConversation(base)).toBe(true)
  })

  it('cada condição contrária tira a I.A', () => {
    expect(aiHandlesConversation({ ...base, aiActive: false })).toBe(false)
    expect(aiHandlesConversation({ ...base, autoReplyEnabled: false })).toBe(false)
    expect(aiHandlesConversation({ ...base, autoRespondersActive: true })).toBe(false)
    expect(aiHandlesConversation({ ...base, conversation: { ...base.conversation, assigned_agent_id: 'u1' } })).toBe(false)
    expect(aiHandlesConversation({ ...base, conversation: { ...base.conversation, ai_autoreply_disabled: true } })).toBe(false)
    expect(
      aiHandlesConversation({ ...base, conversation: { ...base.conversation, bot_handoff_at: '2026-11-21T10:00:00Z' } }),
    ).toBe(false)
    // encerrada: quando o cliente escreve ela reabre antes (059), então a
    // I.A nunca atende uma conversa encerrada — o selo não pode prometer
    expect(aiHandlesConversation({ ...base, conversation: { ...base.conversation, status: 'closed' } })).toBe(false)
    expect(aiHandlesConversation({ ...base, conversation: { ...base.conversation, status: 'pending' } })).toBe(true)
  })
})

describe('activeFlowConversationIds', () => {
  const now = new Date('2026-11-21T12:00:00Z')
  it('inclui execução recente, descarta vencida e ignora conversa nula', () => {
    const ids = activeFlowConversationIds(
      [
        { conversation_id: 'c-1h', last_advanced_at: '2026-11-21T11:00:00Z', fallback_policy: { on_timeout_hours: 24 } },
        { conversation_id: 'c-3h', last_advanced_at: '2026-11-21T09:00:00Z', fallback_policy: { on_timeout_hours: 2 } },
        { conversation_id: null, last_advanced_at: '2026-11-21T11:59:00Z', fallback_policy: null },
      ],
      now,
    )
    expect([...ids]).toEqual(['c-1h'])
  })
})

describe('conversationBadge', () => {
  it('fluxo tem prioridade sobre a I.A', () => {
    expect(conversationBadge({ inActiveFlow: true, aiHandles: true })).toBe('flow')
    expect(conversationBadge({ inActiveFlow: false, aiHandles: true })).toBe('ai')
    expect(conversationBadge({ inActiveFlow: false, aiHandles: false })).toBe(null)
  })
})
