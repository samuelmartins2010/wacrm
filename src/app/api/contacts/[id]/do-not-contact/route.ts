import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'

type Ctx = { params: Promise<{ id: string }> }

/** PUT { value: boolean } — admin marks/unmarks "não quer receber campanhas". */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId } = await requireRole('admin')
    const body = await request.json().catch(() => null)
    if (typeof body?.value !== 'boolean') {
      return NextResponse.json({ error: 'value deve ser booleano' }, { status: 400 })
    }
    const patch = body.value
      ? { do_not_contact: true, do_not_contact_at: new Date().toISOString(), do_not_contact_source: 'manual' }
      : { do_not_contact: false, do_not_contact_at: new Date().toISOString(), do_not_contact_source: 'manual' }
    const { data, error } = await supabase
      .from('contacts')
      .update(patch)
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id, do_not_contact, do_not_contact_at, do_not_contact_source')
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    return NextResponse.json({ contact: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
