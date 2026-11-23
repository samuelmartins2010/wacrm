/**
 * Envio de um lote da transmissão para /api/whatsapp/broadcast.
 *
 * Ritmo: 10 contatos por chamada e 1 s entre chamadas (≈ 60 chamadas
 * por minuto), abaixo do limite de mensagens por número da Meta. O
 * limite da rota (`RATE_LIMITS.broadcast`) precisa comportar esse ritmo.
 *
 * Se mesmo assim a rota responder 429, o lote não é dado como falho:
 * espera o tempo que ela pediu e reenvia o mesmo lote (até
 * MAX_RATE_LIMIT_RETRIES vezes). Qualquer outro erro sobe na hora.
 */

export const SEND_BATCH_SIZE = 10
export const SEND_BATCH_DELAY_MS = 1000
export const MAX_RATE_LIMIT_RETRIES = 3

export interface BroadcastApiResult {
  phone: string
  status: 'sent' | 'failed'
  whatsapp_message_id?: string
  error?: string
}

const defaultSleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function postBroadcastBatch(
  body: unknown,
  deps: { fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<unknown> } = {},
): Promise<BroadcastApiResult[]> {
  const fetchFn = deps.fetchFn ?? fetch
  const sleep = deps.sleep ?? defaultSleep

  for (let attempt = 0; ; attempt++) {
    const res = await fetchFn('/api/whatsapp/broadcast', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))

    if (res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES) {
      const seconds = Number(data?.retry_after_seconds) || 1
      await sleep(seconds * 1000)
      continue
    }
    if (!res.ok) throw new Error(data?.error || 'Broadcast API request failed')
    return (data.results ?? []) as BroadcastApiResult[]
  }
}
