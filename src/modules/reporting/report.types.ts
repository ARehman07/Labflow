// Shared, serializable report shape (no server imports — safe for client use).

export interface ReportParam {
  name: string;
  value: string | null;
  unit: string | null;
  reference: string;
  flag: string;
  isBold: boolean;
  isCalculated: boolean;
  /** For a cut-off result: "Reactive" / "Non-reactive" (or the test's own words). */
  interpretation: string | null;
  /** This patient's earlier released values, one per column in ReportTest.history (newest first). */
  previous: (string | null)[];
  previousFlags: (string | null)[];
  /** Direction against the most recent earlier value, when both are numbers. */
  trend: 'UP' | 'DOWN' | 'SAME' | null;
}

/** One earlier visit shown as a column on a report printed with history. */
export interface HistoryColumn {
  visitId: string;
  slipNo: string;
  date: string;
}

export interface ReportTest {
  name: string;
  department: string;
  approvedBy: string | null;
  params: ReportParam[];
  /** Earlier visits where this test was released for the same patient (MR#), newest first, at most three. */
  history: HistoryColumn[];
  /** How the test is done — analyzer, method, reagent — printed under the results. */
  methodNote: string | null;
  /** Remarks entered with the result, printed for the patient and doctor. */
  remarks: string | null;
  /** The reference lab that performed it, when it was sent out. */
  performedAt: string | null;
  /** Culture & sensitivity, for tests reported that way. */
  culture: {
    growth: boolean;
    organism: string | null;
    colonyCount: string | null;
    incubation: string | null;
    remarks: string | null;
    sensitivities: { antibiotic: string; result: string; mic: string | null }[];
  } | null;
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
  /** Whether any test on the report has an earlier result to show. */
  hasHistory: boolean;
}
