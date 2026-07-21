import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { OnboardingWizard } from '@/components/onboarding/onboarding-wizard'

export default async function OnboardingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Already onboarded if whatsapp_config row exists for the account.
  const { data: profile } = await supabase
    .from('profiles')
    .select('account_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (profile?.account_id) {
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('phone_number_id')
      .eq('account_id', profile.account_id)
      .maybeSingle()

    if (config?.phone_number_id) {
      redirect('/dashboard')
    }
  }

  return <OnboardingWizard />
}
