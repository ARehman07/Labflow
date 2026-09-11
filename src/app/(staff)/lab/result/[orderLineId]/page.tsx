import { notFound } from 'next/navigation';
import { getEntryAction } from '@/modules/lab/lab.actions';
import { ResultEntryClient } from './ResultEntryClient';
import { CultureEntry } from './CultureEntry';

export default async function ResultEntryPage({ params }: { params: { orderLineId: string } }) {
  const entry = await getEntryAction(params.orderLineId);
  if (!entry) notFound();
  // A culture is entered as organism and antibiotic sensitivities, not parameters.
  if (entry.reportFormat === 'CULTURE') return <CultureEntry entry={entry} />;
  return <ResultEntryClient entry={entry} />;
}
