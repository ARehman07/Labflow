// Shared, serializable report shape (no server imports — safe for client use).

export interface ReportParam {
  name: string;
  value: string | null;
  unit: string | null;
  reference: string;
  flag: string;
  isBold: boolean;
  isCalculated: boolean;
}

export interface ReportTest {
  name: string;
  department: string;
  approvedBy: string | null;
  params: ReportParam[];
}

/** Who the lab is, as it should appear on paper. */
export interface Letterhead {
  labName: string;
  tagline: string | null;
  logoDataUrl: string | null;
  licenseNo: string | null;
  email: string | null;
  footerNote: string | null;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
}

export interface ReportData {
  letterhead: Letterhead;
  branchName: string;
  branchAddress: string | null;
  branchPhone: string | null;
  patientName: string;
  mrNo: string;
  age: number | null;
  sex: string | null;
  mobile: string | null;
  slipNo: string;
  bookedAt: string;
  reportedAt: string | null;
  doctorName: string | null;
  tests: ReportTest[];
}
