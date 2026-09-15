/**
 * The analyte code a parameter most likely measures, from its name.
 *
 * Used to fill in codes a lab never typed, so report history can join the same
 * measurement across tests. It only ever matches a whole, known name — after
 * ignoring capitals, brackets and punctuation — or a parameter code that is
 * already a known analyte. Anything else returns null: a wrong join would put
 * one patient's HDL beside their total cholesterol, which is worse than no
 * history at all.
 */

const NAMES: Record<string, string[]> = {
  HB: ['haemoglobin', 'hemoglobin', 'hb', 'hgb'],
  WBC: ['total leucocyte count', 'total leukocyte count', 'tlc', 'wbc', 'white blood cell count', 'white blood cells'],
  RBC: ['rbc', 'red blood cell count', 'total rbc count'],
  PLT: ['platelet count', 'platelets', 'plt'],
  HCT: ['haematocrit', 'hematocrit', 'hct', 'pcv', 'packed cell volume'],
  MCV: ['mcv', 'mean corpuscular volume'],
  MCH: ['mch', 'mean corpuscular haemoglobin', 'mean corpuscular hemoglobin'],
  MCHC: ['mchc', 'mean corpuscular haemoglobin concentration', 'mean corpuscular hemoglobin concentration'],
  ESR: ['esr', 'erythrocyte sedimentation rate'],
  GLUCOSE_F: ['fasting blood sugar', 'blood sugar fasting', 'fbs', 'fasting glucose', 'fasting plasma glucose', 'glucose fasting'],
  GLUCOSE_R: ['random blood sugar', 'blood sugar random', 'rbs', 'random glucose', 'random plasma glucose', 'glucose random'],
  GLUCOSE_PP: ['post prandial blood sugar', 'blood sugar post prandial', 'pp blood sugar', 'post prandial glucose'],
  HBA1C: ['hba1c', 'glycated haemoglobin', 'glycated hemoglobin', 'glycosylated haemoglobin', 'glycosylated hemoglobin'],
  TCHOL: ['total cholesterol', 'cholesterol total', 'serum cholesterol', 'cholesterol'],
  HDL: ['hdl cholesterol', 'hdl', 'hdl c'],
  LDL: ['ldl cholesterol', 'ldl', 'ldl c'],
  VLDL: ['vldl cholesterol', 'vldl'],
  TG: ['triglycerides', 'triglyceride', 'tg', 'serum triglycerides'],
  CHOL_HDL: ['cholesterol hdl ratio', 'total cholesterol hdl ratio', 'tc hdl ratio'],
  UREA: ['urea', 'blood urea', 'serum urea'],
  CREAT: ['creatinine', 'serum creatinine'],
  URIC: ['uric acid', 'serum uric acid'],
  NA: ['sodium', 'serum sodium'],
  K: ['potassium', 'serum potassium'],
  CL: ['chloride', 'serum chloride'],
  CA: ['calcium', 'serum calcium'],
  ALT: ['alt', 'sgpt', 'alt sgpt', 'sgpt alt', 'alanine aminotransferase'],
  AST: ['ast', 'sgot', 'ast sgot', 'sgot ast', 'aspartate aminotransferase'],
  ALP: ['alp', 'alkaline phosphatase'],
  TBIL: ['total bilirubin', 'bilirubin total', 'serum bilirubin total'],
  DBIL: ['direct bilirubin', 'bilirubin direct'],
  ALB: ['albumin', 'serum albumin'],
  TP: ['total protein', 'total proteins', 'serum total protein'],
  TSH: ['tsh', 'thyroid stimulating hormone'],
  T3: ['t3', 'total t3', 'triiodothyronine'],
  T4: ['t4', 'total t4', 'thyroxine'],
  FT4: ['free t4', 'ft4'],
  VITD: ['vitamin d', '25 oh vitamin d', 'vitamin d3'],
  B12: ['vitamin b12', 'b12'],
  FERRITIN: ['ferritin', 'serum ferritin'],
  CRP: ['crp', 'c reactive protein'],
  HBSAG: ['hbsag', 'hbsag index', 'hepatitis b surface antigen'],
  HCV: ['anti hcv', 'hcv', 'hcv antibody'],
  ABO: ['blood group', 'blood group abo rh', 'abo rh', 'blood grouping'],
};

const BY_NAME = new Map<string, string>(
  Object.entries(NAMES).flatMap(([code, names]) => names.map((n) => [n, code] as const)),
);
const KNOWN_CODES = new Set(Object.keys(NAMES));

/** Lower case, brackets and punctuation dropped, single spaces: "LDL Cholesterol (calculated)" → "ldl cholesterol". */
export function normaliseName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function suggestAnalyte(p: { name: string; code: string }): string | null {
  const byName = BY_NAME.get(normaliseName(p.name));
  if (byName) return byName;
  const code = p.code.trim().toUpperCase();
  return KNOWN_CODES.has(code) ? code : null;
}
