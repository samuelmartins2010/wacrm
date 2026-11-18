// Which conversational side effects an inbound WhatsApp message triggers.
// Kept pure so the webhook's routing rules are unit-tested.

export type InboundAutomationTrigger =
  | 'new_contact_created'
  | 'first_inbound_message'
  | 'new_message_received'
  | 'keyword_match'
  | 'interactive_reply'

export interface InboundPlanInput {
  /** Reativação handled this message as an opt-out ("SAIR"): it already replied. */
  reactivationConsumed: boolean
  /** A Flow consumed the message (only known after shouldRunFlows). */
  flowConsumed: boolean
  interactiveReplyId: string | null | undefined
  contactWasCreated: boolean
  isFirstInboundMessage: boolean
  text: string
}

/** Flows don't see an opt-out: the confirmation is the only reply. */
export function shouldRunFlows(i: Pick<InboundPlanInput, 'reactivationConsumed'>): boolean {
  return !i.reactivationConsumed
}

export function planAutomationTriggers(i: InboundPlanInput): InboundAutomationTrigger[] {
  // An opt-out fires no automation at all — not even relationship
  // triggers — so the customer gets only the opt-out confirmation.
  if (i.reactivationConsumed) return []
  const triggers: InboundAutomationTrigger[] = []
  // Content-level triggers are suppressed when a flow consumed the message.
  if (!i.flowConsumed) {
    triggers.push('new_message_received', 'keyword_match')
    if (i.interactiveReplyId) triggers.push('interactive_reply')
  }
  if (i.contactWasCreated) triggers.unshift('new_contact_created')
  if (i.isFirstInboundMessage) triggers.unshift('first_inbound_message')
  return triggers
}

export function shouldRunAiReply(i: InboundPlanInput): boolean {
  return !i.reactivationConsumed && !i.flowConsumed && !i.interactiveReplyId && i.text.trim().length > 0
}
