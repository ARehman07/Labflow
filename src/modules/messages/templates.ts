/**
 * Patient message wording, kept free of the database so it can be tested and
 * used on screen for the live preview.
 */

export const MESSAGE_EVENTS = [
  'SLIP_BOOKED',
  'REPORT_READY',
  'B2B_RECEIVED',
  'PAYMENT_RECEIVED',
  'REFUND_ISSUED',
  'WHATSAPP_REPORT',
] as const;
export type MessageEvent = (typeof MESSAGE_EVENTS)[number];

/** The placeholders each message can use. */
export const EVENT_VARS: Record<MessageEvent, string[]> = {
  SLIP_BOOKED: ['patient', 'lab', 'slip', 'mr', 'tests', 'amount', 'due', 'link', 'code'],
  REPORT_READY: ['patient', 'lab', 'slip', 'mr', 'link', 'code'],
  B2B_RECEIVED: ['partner', 'patient', 'lab', 'slip', 'tests', 'ref'],
  PAYMENT_RECEIVED: ['patient', 'lab', 'slip', 'amount', 'due'],
  REFUND_ISSUED: ['patient', 'lab', 'slip', 'amount'],
  WHATSAPP_REPORT: ['patient', 'lab', 'slip', 'mr', 'link'],
};

export const DEFAULT_TEMPLATES: Record<MessageEvent, string> = {
  SLIP_BOOKED: 'Dear {patient}, thank you for choosing {lab}. Slip #{slip}, total Rs {amount}, balance Rs {due}. See your reports at {link} with lab code {code}.',
  REPORT_READY: 'Dear {patient}, your report for slip #{slip} from {lab} is ready. View it at {link} with lab code {code} and this mobile number.',
  B2B_RECEIVED: '{lab}: sample received for {patient}, slip #{slip}, your ref {ref}. Tests: {tests}.',
  PAYMENT_RECEIVED: 'Dear {patient}, Rs {amount} received against slip #{slip} at {lab}. Balance: Rs {due}.',
  REFUND_ISSUED: 'Dear {patient}, Rs {amount} has been refunded against slip #{slip} at {lab}.',
  WHATSAPP_REPORT: 'Assalam o Alaikum {patient}, your lab report from {lab} (slip #{slip}) is ready. You can view it here: {link}',
};

/**
 * Fill in {placeholders}. A known one with no value becomes blank; an unknown
 * one is left as typed, so a misspelt {patinet} shows up in the preview.
 */
export function renderTemplate(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body
    .replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key] ?? '') : match))
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** How many SMS a message is billed as: 160 plain characters, or 70 once it has Urdu or other non-Latin text. */
export function smsParts(text: string): number {
  if (text.length === 0) return 0;
  const unicode = /[^\x00-\x7F]/.test(text);
  const single = unicode ? 70 : 160;
  const multi = unicode ? 67 : 153;
  return text.length <= single ? 1 : Math.ceil(text.length / multi);
}

/** Rupees as a message shows them: 2400 → "2,400". */
export const money = (n: number) => Math.round(n).toLocaleString('en-US');
