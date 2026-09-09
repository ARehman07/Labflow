import { notFound } from 'next/navigation';
import { getEntryAction } from '@/modules/lab/lab.actions';
import { ResultEntryClient } from './ResultEntryClient';

export default async function ResultEntryPage({ params }: { params: { orderLineId: string } }) {
  const entry = await getEntryAction(params.orderLineId);
  if (!entry) notFound();
  return <ResultEntryClient entry={entry} />;
}
