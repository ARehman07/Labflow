import { Icon } from '@/components/ui/Icon';
import { cn } from '@/lib/utils';
import type { Letterhead as LetterheadData } from '@/modules/reporting/report.types';

/**
 * The masthead on anything the lab hands a patient.
 *
 * A printed report is the lab's face — often the only thing a patient keeps,
 * and the thing a referring doctor judges the lab by. Previously it was headed
 * with the *branch* name ("Main Branch"), so the lab's own name appeared
 * nowhere on its own report. The lab name now leads, the branch is a location
 * line beneath it, and the logo is real if one has been uploaded.
 */
export function Letterhead({
  data, docLabel, docNumber, right, className,
}: {
  data: LetterheadData;
  /** e.g. "Laboratory Report" or "Lab Slip". */
  docLabel: string;
  docNumber?: string;
  /** QR / barcode block. */
  right?: React.ReactNode;
  className?: string;
}) {
  const contact = [data.branchAddress, data.branchPhone, data.email].filter(Boolean).join('  ·  ');

  return (
    <header className={cn('letterhead', className)}>
      <div className="flex items-start gap-4">
        {data.logoDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL, not a remote asset
          <img
            src={data.logoDataUrl}
            alt=""
            className="h-16 w-16 shrink-0 object-contain print:h-14 print:w-14"
          />
        ) : (
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white print:h-14 print:w-14">
            <Icon name="flask" className="h-8 w-8" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          {/* The lab, not the software and not the branch. Never truncated —
              a clipped lab name on a narrower page ("ARFA DIAGNOSTIC CEN…") is
              worse than one that wraps onto a second line. */}
          <h1 className="text-balance text-[26px] font-extrabold uppercase leading-tight tracking-tight text-strong print:text-[20px]">
            {data.labName}
          </h1>
          {data.tagline && (
            <p className="text-sm font-medium text-brand-700 dark:text-brand-300 print:text-[10px]">
              {data.tagline}
            </p>
          )}
          <p className="mt-0.5 text-xs text-muted print:text-[10px]">
            {data.branchName}
            {contact && <span className="text-subtle">{'  ·  '}{contact}</span>}
          </p>
          {data.licenseNo && (
            <p className="text-[11px] text-subtle print:text-[9px]">Reg. No. {data.licenseNo}</p>
          )}
        </div>

        <div className="flex shrink-0 items-start gap-3">
          <div className="text-end">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-subtle">{docLabel}</div>
            {docNumber && (
              <div className="font-mono text-lg font-extrabold tabular-nums text-strong">{docNumber}</div>
            )}
          </div>
          {right}
        </div>
      </div>

      {/* A rule with weight — the visual line between letterhead and content. */}
      <div className="mt-3 h-[3px] w-full rounded-full bg-gradient-to-r from-brand-600 via-brand-500 to-clinic-500 print:h-[2px]" />
    </header>
  );
}
