import { requirePlatformAdmin } from '@/core/platform/session';
import { NewLabForm } from './NewLabForm';

export default async function NewLabPage() {
  await requirePlatformAdmin();
  return <NewLabForm />;
}
