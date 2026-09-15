import { redirect } from 'next/navigation';
import { currentPlatformAdmin } from '@/core/platform/session';
import { platformConfigured } from '@/core/platform/admins';
import { PlatformLoginForm } from './PlatformLoginForm';

export default async function PlatformLoginPage() {
  if (await currentPlatformAdmin()) redirect('/platform');
  return <PlatformLoginForm configured={platformConfigured()} />;
}
