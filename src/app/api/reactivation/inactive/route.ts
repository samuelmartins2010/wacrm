import { NextResponse } from 'next/server'
import { requireRole } from '@/lib/auth/account'
import { loadCandidates } from '@/lib/reactivation/queries'
import { errorResponse, parseBands, parseIds } from '@/lib/reactivation/http'

const PAGE_SIZE = 50

/** GET ?band=late,cooling&tag=<id,..>&excludeTag=<id,..>&page=0 */
export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const url = new URL(request.url)
    const all = await loadCandidates(
      supabase,
      accountId,
      {
        bands: ['late', 'cooling', 'gone'],
        tagIds: parseIds(url.searchParams.get('tag')),
        excludeTagIds: parseIds(url.searchParams.get('excludeTag')),
      },
      new Date(),
    )
    const counts = { late: 0, cooling: 0, gone: 0 }
    for (const c of all) counts[c.band]++

    const bands = parseBands(url.searchParams.get('band'))
    const filtered = all.filter((c) => bands.includes(c.band))
    const page = Math.max(0, Number(url.searchParams.get('page')) || 0)
    return NextResponse.json({
      counts,
      total: filtered.length,
      page,
      pageSize: PAGE_SIZE,
      contacts: filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE),
    })
  } catch (err) {
    return errorResponse(err)
  }
}
