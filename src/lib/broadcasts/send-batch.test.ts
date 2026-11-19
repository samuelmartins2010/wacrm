import { describe, expect, it, vi } from 'vitest'
import { RATE_LIMITS } from '@/lib/rate-limit'
import { postBroadcastBatch, SEND_BATCH_DELAY_MS, SEND_BATCH_SIZE } from './send-batch'

// O assistente chama /api/whatsapp/broadcast uma vez por lote de
// SEND_BATCH_SIZE contatos, com SEND_BATCH_DELAY_MS entre lotes. Com o
// limite antigo (5 chamadas/min) tudo depois do 5º lote voltava 429 e
// era marcado como "falhou".

const okBody = { results: [{ phone: '+5511900000001', status: 'sent', whatsapp_message_id: 'w1' }] }

function res(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

describe('ritmo do assistente x limite da rota', () => {
  it('o limite de chamadas por minuto comporta o ritmo de envio do assistente', () => {
    const callsPerWindow = Math.ceil(RATE_LIMITS.broadcast.windowMs / SEND_BATCH_DELAY_MS)
    expect(SEND_BATCH_SIZE).toBe(10)
    expect(RATE_LIMITS.broadcast.limit).toBeGreaterThanOrEqual(callsPerWindow)
  })
})

describe('postBroadcastBatch', () => {
  it('em 429, espera o tempo pedido e reenvia o mesmo lote', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(res(429, { error: 'Rate limit exceeded', retry_after_seconds: 7 }))
      .mockResolvedValueOnce(res(200, okBody))
    const sleep = vi.fn().mockResolvedValue(undefined)
    const out = await postBroadcastBatch({ recipients: [] }, { fetchFn, sleep })
    expect(out).toEqual(okBody.results)
    expect(fetchFn).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledWith(7000)
  })

  it('desiste depois de 3 tentativas com 429 e devolve o erro', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(429, { error: 'Rate limit exceeded', retry_after_seconds: 1 }))
    const sleep = vi.fn().mockResolvedValue(undefined)
    await expect(postBroadcastBatch({ recipients: [] }, { fetchFn, sleep })).rejects.toThrow('Rate limit exceeded')
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('outro erro da rota não é reenviado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(res(400, { error: 'template_name is required' }))
    const sleep = vi.fn()
    await expect(postBroadcastBatch({ recipients: [] }, { fetchFn, sleep })).rejects.toThrow('template_name is required')
    expect(fetchFn).toHaveBeenCalledTimes(1)
    expect(sleep).not.toHaveBeenCalled()
  })
})
