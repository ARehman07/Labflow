import { auth } from '@/core/auth/auth';
import { LabTabsSlot } from './LabTabsSlot';

export default async function LabLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  return (
    <>
      <LabTabsSlot permissions={session?.user?.permissions ?? []} />
      {children}
    </>
  );
}
