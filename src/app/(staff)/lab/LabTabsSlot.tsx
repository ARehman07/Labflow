'use client';

import { usePathname } from 'next/navigation';
import { LabTabs } from './LabTabs';

const LIST_PAGES = new Set(['/lab', '/lab/approvals', '/lab/critical', '/lab/notifiable']);

/** Shows the lab tabs on the worklists only, not on single-record screens. */
export function LabTabsSlot({ permissions }: { permissions: string[] }) {
  const pathname = usePathname();
  if (!LIST_PAGES.has(pathname)) return null;
  return <div className="mb-5"><LabTabs permissions={permissions} /></div>;
}
