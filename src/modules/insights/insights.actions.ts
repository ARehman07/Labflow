'use server';

import { currentUser } from '@/core/rbac/guard';
import { getDashboard, type DashboardData } from './insights.service';

export type { DashboardData, CriticalPreview } from './insights.service';

const EMPTY: DashboardData = {
  revenueToday: 0, patientsToday: 0, pendingResults: 0, overdueTat: 0,
  revenue7d: [], testMix: [], doctors: [], pipeline: [],
  revenueYesterday: 0, patientsYesterday: 0,
  criticalOpen: 0, criticalPreview: [], notifiableOpen: 0,
  awaitingApproval: 0, duesOutstanding: 0, duesCount: 0,
  testsCompletedToday: 0, onTimeRate: null,
};

export async function getDashboardAction(): Promise<DashboardData> {
  const user = await currentUser();
  if (!user.branchId || !(user.permissions ?? []).includes('insights.view')) return EMPTY;
  return getDashboard(user.branchId);
}
