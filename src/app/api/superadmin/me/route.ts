// GET — tells the caller whether they're a platform admin, nothing
// else. Used by the main app's sidebar to decide whether to show a
// "Super Admin" shortcut — without this, someone would have to type
// /superadmin into the URL bar and hope they're already logged in
// (the redirect chain doesn't preserve that destination through login).

import { NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/superadmin/auth'

export async function GET() {
  try {
    await requirePlatformAdmin()
    return NextResponse.json({ isPlatformAdmin: true })
  } catch {
    // Not a platform admin (or not logged in) — same response either
    // way, on purpose. This endpoint answers one yes/no question; it
    // doesn't need to distinguish "wrong role" from "not logged in"
    // for a caller that's just deciding whether to show a menu item.
    return NextResponse.json({ isPlatformAdmin: false })
  }
}
