import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'

/**
 * Shared auth for the cron endpoints: `x-cron-secret` must equal
 * AUTOMATION_CRON_SECRET, compared in constant time. Returns the error
 * response to send, or null when authorized.
 */
export function verifyCronSecret(request: Request): NextResponse | null {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = Buffer.from(request.headers.get('x-cron-secret') ?? '', 'utf8')
  const wanted = Buffer.from(expected, 'utf8')
  // timingSafeEqual throws on different lengths; that case is a mismatch.
  if (supplied.length !== wanted.length || !timingSafeEqual(supplied, wanted)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}
