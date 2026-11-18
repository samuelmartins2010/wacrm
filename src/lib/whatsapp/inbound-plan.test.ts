import { describe, it, expect } from 'vitest'
import { planAutomationTriggers, shouldRunAiReply, shouldRunFlows } from './inbound-plan'

const base = {
  reactivationConsumed: false,
  flowConsumed: false,
  interactiveReplyId: null as string | null,
  contactWasCreated: false,
  isFirstInboundMessage: false,
  text: 'oi',
}

describe('opt-out consumed by Reativação ("SAIR")', () => {
  const sair = { ...base, reactivationConsumed: true, text: 'SAIR' }
  it('does not run flows', () => {
    expect(shouldRunFlows(sair)).toBe(false)
  })
  it('fires no automation trigger at all (not even relationship ones)', () => {
    expect(planAutomationTriggers({ ...sair, contactWasCreated: true, isFirstInboundMessage: true })).toEqual([])
  })
  it('does not run the AI auto-reply', () => {
    expect(shouldRunAiReply(sair)).toBe(false)
  })
})

describe('ordinary messages keep today\'s behaviour', () => {
  it('runs flows', () => {
    expect(shouldRunFlows(base)).toBe(true)
  })
  it('plain text fires message triggers and the AI', () => {
    expect(planAutomationTriggers(base)).toEqual(['new_message_received', 'keyword_match'])
    expect(shouldRunAiReply(base)).toBe(true)
  })
  it('first message of a new contact also fires relationship triggers, in the same order as before', () => {
    expect(planAutomationTriggers({ ...base, contactWasCreated: true, isFirstInboundMessage: true })).toEqual([
      'first_inbound_message',
      'new_contact_created',
      'new_message_received',
      'keyword_match',
    ])
  })
  it('a flow-consumed message keeps only relationship triggers and skips the AI', () => {
    const f = { ...base, flowConsumed: true, isFirstInboundMessage: true }
    expect(planAutomationTriggers(f)).toEqual(['first_inbound_message'])
    expect(shouldRunAiReply(f)).toBe(false)
  })
  it('interactive taps fire interactive_reply and skip the AI', () => {
    const i = { ...base, interactiveReplyId: 'btn_1' }
    expect(planAutomationTriggers(i)).toEqual(['new_message_received', 'keyword_match', 'interactive_reply'])
    expect(shouldRunAiReply(i)).toBe(false)
  })
  it('empty text skips the AI', () => {
    expect(shouldRunAiReply({ ...base, text: '   ' })).toBe(false)
  })
})
