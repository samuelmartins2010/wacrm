import { Suspense } from 'react';
import { CampaignWizard } from '@/components/reactivation/campaign-wizard';

export default function NewReactivationCampaignPage() {
  return (
    <Suspense fallback={null}>
      <CampaignWizard />
    </Suspense>
  );
}
