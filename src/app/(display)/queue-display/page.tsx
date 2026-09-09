import { redirect } from 'next/navigation';
import { auth } from '@/core/auth/auth';
import { QueueDisplay } from './QueueDisplay';

export const dynamic = 'force-dynamic';

export default async function QueueDisplayPage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  return <QueueDisplay />;
}
