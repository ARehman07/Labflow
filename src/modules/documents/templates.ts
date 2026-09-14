import { renderTemplate } from '@/modules/messages/templates';

export const DOCUMENT_TYPES = ['CONSENT', 'CERTIFICATE', 'LETTER', 'OTHER'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** What a form can fill in about the patient and their booking. */
export const DOCUMENT_VARS = ['patient', 'mr', 'age', 'sex', 'mobile', 'cnic', 'address', 'date', 'lab', 'slip', 'doctor', 'tests'] as const;

/** Fill a form. Line breaks are kept, since a form is laid out in paragraphs. */
export function fillDocument(body: string, vars: Record<string, string | number | null | undefined>): string {
  return body.split('\n').map((line) => renderTemplate(line, vars)).join('\n').trim();
}

/** Two forms most labs print, so the list is not empty on the first day. */
export const STARTER_TEMPLATES: { title: string; type: DocumentType; body: string }[] = [
  {
    title: 'Consent for sample collection',
    type: 'CONSENT',
    body: [
      'I, {patient} (MR# {mr}, age {age}, {sex}), agree to give the samples needed for the tests booked on slip #{slip}: {tests}.',
      '',
      'The procedure and its minor risks — bruising, slight pain and, rarely, fainting — have been explained to me, and I have been able to ask questions.',
      '',
      'I understand that {lab} keeps my results confidential and shares them only with me and my referring doctor ({doctor}).',
      '',
      'Date: {date}',
    ].join('\n'),
  },
  {
    title: 'Laboratory test certificate',
    type: 'CERTIFICATE',
    body: [
      'This is to certify that {patient}, MR# {mr}, age {age}, {sex}, CNIC {cnic}, had the following tests performed at {lab}: {tests}.',
      '',
      'The results are recorded against slip #{slip} and are available from the laboratory on request.',
      '',
      'Issued on {date}.',
    ].join('\n'),
  },
];
