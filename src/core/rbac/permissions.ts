/**
 * Central permission catalogue and role→permission mapping.
 * Permissions are enforced server-side (see requirePermission). The UI may hide
 * controls a user lacks, but that is convenience only — the server is authority.
 * Closes the function-level-authorization gap from ../../vulnerabilities.md (H-5).
 *
 * ── How the split is drawn ───────────────────────────────────────────────
 * Three separations matter in a lab, and they are the reason this list is not
 * simply "can use screen X":
 *
 *  1. Producing a result is not releasing one. A Technician enters, a
 *     Pathologist approves. (ISO 15189; also enforced by Tenant.allowSelfVerify.)
 *  2. Taking money is not giving it back. A Receptionist collects; refunds,
 *     commission payouts and ledger entries need separate authority, or the
 *     oldest fraud in the book works: take cash, log a refund, keep the gap.
 *  3. Setting the price is not charging it. Whoever fixes the family-card rate
 *     must not be the person applying it at the counter — so commercial policy
 *     lives behind settings.manage, held only by the Owner.
 */

export interface PermissionDef {
  code: string;
  label: string;
  /** Grouping for the admin screen. */
  group: 'Reception' | 'Laboratory' | 'Money' | 'Reporting' | 'Administration';
  /** Shown in admin so the consequence of granting it is legible. */
  note?: string;
}

export const PERMISSIONS = {
  // ── Reception ──
  VISIT_CREATE: { code: 'visit.create', label: 'Create booking', group: 'Reception' },
  VISIT_MODIFY: { code: 'visit.modify', label: 'Modify booking', group: 'Reception' },
  VISIT_CANCEL: { code: 'visit.cancel', label: 'Cancel booking', group: 'Reception' },
  PATIENT_MANAGE: {
    code: 'patient.manage', label: 'Manage patients & family cards', group: 'Reception',
    note: 'Includes issuing a family card and adding members to one.',
  },

  // ── Laboratory ──
  SAMPLE_COLLECT: { code: 'sample.collect', label: 'Collect samples', group: 'Laboratory' },
  RESULT_ENTER: { code: 'result.enter', label: 'Enter results', group: 'Laboratory' },
  RESULT_APPROVE: {
    code: 'result.approve', label: 'Approve results', group: 'Laboratory',
    note: 'Releases a result to the patient. Keep separate from Enter results.',
  },
  WORKFLOW_ADVANCE: { code: 'workflow.advance', label: 'Advance workflow & queue', group: 'Laboratory' },
  CRITICAL_MANAGE: { code: 'critical.manage', label: 'Handle critical-result callbacks', group: 'Laboratory' },
  NOTIFIABLE_MANAGE: { code: 'notifiable.manage', label: 'Handle notifiable disease reports', group: 'Laboratory' },

  // ── Money ──
  BILLING_VIEW: {
    code: 'billing.view', label: 'View invoices', group: 'Money',
    note: 'Invoices carry patient names and amounts, so this is not a harmless read.',
  },
  PAYMENT_RECEIVE: { code: 'payment.receive', label: 'Receive payment', group: 'Money' },
  REFUND_ISSUE: {
    code: 'refund.issue', label: 'Issue refund', group: 'Money',
    note: 'Money leaving the lab. Keep separate from Receive payment.',
  },
  FINANCE_VIEW: { code: 'finance.view', label: 'View finance & referrals', group: 'Money' },
  LEDGER_MANAGE: {
    code: 'ledger.manage', label: 'Record income & expenses', group: 'Money',
    note: 'Writes to the day book. Previously anyone who could view finance could do this.',
  },
  COMMISSION_PAY: {
    code: 'commission.pay', label: 'Settle doctor commission', group: 'Money',
    note: 'Marks a payable as paid. Money leaving the lab.',
  },

  // ── Reporting ──
  REPORT_PRINT: { code: 'report.print', label: 'Print report', group: 'Reporting' },
  REPORT_DELIVER: { code: 'report.deliver', label: 'Deliver report', group: 'Reporting' },
  INSIGHTS_VIEW: { code: 'insights.view', label: 'View dashboards', group: 'Reporting' },

  // ── Administration ──
  ADMIN_MANAGE: { code: 'admin.manage', label: 'Manage catalogue & branches', group: 'Administration' },
  USER_MANAGE: { code: 'user.manage', label: 'Manage users & roles', group: 'Administration' },
  SETTINGS_MANAGE: {
    code: 'settings.manage', label: 'Set lab policy', group: 'Administration',
    note: 'Family-card rate, joining fee, member cap and result self-verification. Owner only.',
  },
} as const satisfies Record<string, PermissionDef>;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]['code'];

export const ALL_PERMISSIONS: readonly PermissionDef[] = Object.values(PERMISSIONS);

const every = ALL_PERMISSIONS.map((p) => p.code) as PermissionCode[];

/**
 * What a new lab starts with.
 *
 * Three roles, not eight. A lab with four people does not have an Accountant
 * and a Phlebotomist and a Pathologist — it has an owner and some staff, and a
 * long list of job titles nobody holds is a wall to climb before the first
 * booking. Bigger structures are available on demand as presets below, and the
 * owner can build anything else from scratch.
 */
export const DEFAULT_ROLES: Record<string, PermissionCode[]> = {
  /** The lab owner. Holds everything, cannot be edited, is the way back in. */
  Owner: every,

  /** Runs the lab day to day. Everything operational; no policy, no accounts. */
  Manager: [
    'visit.create', 'visit.modify', 'visit.cancel', 'patient.manage',
    'sample.collect', 'result.enter', 'result.approve', 'workflow.advance',
    'critical.manage', 'notifiable.manage',
    'billing.view', 'payment.receive', 'finance.view',
    'report.print', 'report.deliver', 'insights.view',
  ],

  /** The counter and the bench. Cannot release results, refund, or see accounts. */
  Staff: [
    'visit.create', 'visit.modify', 'patient.manage',
    'sample.collect', 'result.enter', 'workflow.advance',
    'billing.view', 'payment.receive',
    'report.print',
  ],
};

export interface RolePreset {
  name: string;
  description: string;
  permissions: PermissionCode[];
}

/**
 * Ready-made roles for a lab that has grown enough to need them. Offered in
 * admin as a starting point, never created automatically — a role nobody holds
 * is just noise in a permission screen.
 */
export const ROLE_PRESETS: RolePreset[] = [
  {
    name: 'Admin',
    description: 'Manages the catalogue, branches and staff accounts. Cannot set lab policy.',
    permissions: every.filter((c) => c !== 'settings.manage'),
  },
  {
    name: 'Receptionist',
    description: 'Front desk: bookings, patients, family cards, taking payment.',
    permissions: [
      'visit.create', 'visit.modify', 'visit.cancel', 'patient.manage',
      'billing.view', 'payment.receive', 'workflow.advance', 'report.print',
    ],
  },
  {
    name: 'Phlebotomist',
    description: 'Draws samples and moves them along. Nothing else.',
    permissions: ['sample.collect', 'workflow.advance'],
  },
  {
    name: 'Technician',
    description: 'Runs tests and enters results. Cannot approve their own work.',
    permissions: ['result.enter', 'workflow.advance', 'sample.collect', 'critical.manage', 'notifiable.manage'],
  },
  {
    name: 'Pathologist',
    description: 'Approves and releases results. The second pair of eyes.',
    permissions: ['result.approve', 'result.enter', 'report.print', 'report.deliver', 'critical.manage', 'notifiable.manage'],
  },
  {
    name: 'Accountant',
    description: 'Money only: payments, refunds, the day book, doctor commission.',
    permissions: ['billing.view', 'finance.view', 'insights.view', 'payment.receive', 'refund.issue', 'ledger.manage', 'commission.pay'],
  },
];

/** Roles the app relies on; they cannot be edited or deleted. */
export const SYSTEM_ROLES = ['Owner'] as const;

/** Defaults plus presets, for "restore defaults" on any known role name. */
export const KNOWN_ROLE_PERMISSIONS: Record<string, PermissionCode[]> = {
  ...DEFAULT_ROLES,
  ...Object.fromEntries(ROLE_PRESETS.map((p) => [p.name, p.permissions])),
};
