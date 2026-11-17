import { NextResponse } from 'next/server'
import { requireRole, toErrorResponse } from '@/lib/auth/account'
import { canChangeDoNotContact } from '@/lib/reactivation/do-not-contact'

type Ctx = { params: Promise<{ id: string }> }

/**
 * PUT { value: boolean } — marca/desmarca "não quer receber campanhas".
 * Agent+ marca; só admin+ desmarca (D2). Quem/quando é carimbado pelo
 * trigger contacts_guard_do_not_contact (migration 044) com o usuário
 * da sessão, por isso o update usa o client do usuário.
 */
export async function PUT(request: Request, { params }: Ctx) {
  try {
    const { id } = await params
    const { supabase, accountId, role } = await requireRole('agent')
    const body = await request.json().catch(() => null)
    if (typeof body?.value !== 'boolean') {
      return NextResponse.json({ error: 'value deve ser booleano' }, { status: 400 })
    }
    if (!canChangeDoNotContact(role, body.value)) {
      return NextResponse.json(
        { error: 'Somente administradores podem desmarcar "não quer receber campanhas".' },
        { status: 403 },
      )
    }
    const { data, error } = await supabase
      .from('contacts')
      .update({ do_not_contact: body.value })
      .eq('id', id)
      .eq('account_id', accountId)
      .select('id, do_not_contact, do_not_contact_at, do_not_contact_source, do_not_contact_by')
      .maybeSingle()
    if (error) {
      const status = error.code === '42501' ? 403 : 500
      return NextResponse.json({ error: error.message }, { status })
    }
    if (!data) return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 })
    return NextResponse.json({ contact: data })
  } catch (err) {
    return toErrorResponse(err)
  }
}
