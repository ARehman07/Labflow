'use server';

import { portalService } from './portal.service';
import type { PortalReportSummary } from './portal.service';
import type { ReportData } from '@/modules/reporting/report.types';

export async function requestOtpAction(
  labCode: string,
  mobile: string,
): Promise<{ ok: boolean; devCode?: string; error?: string }> {
  return portalService.requestOtp(labCode, mobile.trim());
}

export async function verifyOtpAction(
  labCode: string,
  mobile: string,
  code: string,
): Promise<{
  ok: boolean;
  token?: string;
  reports?: PortalReportSummary[];
  error?: string;
}> {
  const res = await portalService.verifyOtp(labCode, mobile.trim(), code.trim());
  if (!res.ok || !res.token) return res;
  const reports = (await portalService.listReports(res.token)) ?? [];
  return { ok: true, token: res.token, reports };
}

export async function getPortalReportAction(
  token: string,
  visitId: string,
): Promise<ReportData | null> {
  return portalService.getReport(token, visitId);
}
