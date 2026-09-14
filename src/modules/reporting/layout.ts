/**
 * Printed report layout a lab can choose. Pure, so the settings form, the
 * validation and the report itself all read the same lists.
 */

export const REPORT_FONTS = ['DEFAULT', 'ARIAL', 'TAHOMA', 'GEORGIA', 'TIMES', 'COURIER'] as const;
export type ReportFont = (typeof REPORT_FONTS)[number];

export const FONT_SCALES = [90, 100, 110, 120] as const;

const STACKS: Record<ReportFont, string | undefined> = {
  DEFAULT: undefined,
  ARIAL: 'Arial, Helvetica, sans-serif',
  TAHOMA: 'Tahoma, Verdana, sans-serif',
  GEORGIA: 'Georgia, "Times New Roman", serif',
  TIMES: '"Times New Roman", Times, serif',
  COURIER: '"Courier New", Courier, monospace',
};

/** The CSS font stack for a font choice; undefined keeps the app's own font. */
export function fontStack(font: string): string | undefined {
  return STACKS[(REPORT_FONTS as readonly string[]).includes(font) ? (font as ReportFont) : 'DEFAULT'];
}

export interface ReportLayout {
  showHeader: boolean;
  showFooter: boolean;
  topMarginMm: number;
  bottomMarginMm: number;
  font: string;
  fontScale: number;
}

export const DEFAULT_LAYOUT: ReportLayout = {
  showHeader: true, showFooter: true, topMarginMm: 14, bottomMarginMm: 14, font: 'DEFAULT', fontScale: 100,
};
