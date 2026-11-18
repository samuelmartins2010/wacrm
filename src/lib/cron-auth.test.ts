import { afterEach, describe, expect, it, vi } from 'vitest'
import { verifyCronSecret } from './cron-auth'

const req = (secret?: string) =>
  new Request('http://localhost/api/x/cron', { headers: secret === undefined ? {} : { 'x-cron-secret': secret } })

describe('verifyCronSecret', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('503 when the secret is not configured', () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', '')
    expect(verifyCronSecret(req('x'))?.status).toBe(503)
  })
  it('401 when missing, wrong, or a different length', () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'correct-horse-battery')
    expect(verifyCronSecret(req())?.status).toBe(401)
    expect(verifyCronSecret(req('correct-horse-batterx'))?.status).toBe(401)
    expect(verifyCronSecret(req('short'))?.status).toBe(401)
  })
  it('null (authorized) when it matches', () => {
    vi.stubEnv('AUTOMATION_CRON_SECRET', 'correct-horse-battery')
    expect(verifyCronSecret(req('correct-horse-battery'))).toBeNull()
  })
})
