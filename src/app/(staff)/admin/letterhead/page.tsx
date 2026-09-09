import { can } from '@/core/rbac/guard';
import { getLetterheadAction } from '@/modules/settings/settings.actions';
import { LetterheadClient } from './LetterheadClient';

export const dynamic = 'force-dynamic';

export default async function LetterheadPage() {
  if (!(await can('settings.manage'))) {
    return <p className="rounded-lg bg-warn-soft p-4 text-warn-text">Only the lab owner can change the letterhead.</p>;
  }
  return <LetterheadClient initial={await getLetterheadAction()} />;
}
