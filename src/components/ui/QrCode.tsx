'use client';

import { useEffect, useState } from 'react';

/** Renders a QR code as a data-URL image (generated client-side). */
export function QrCode({ value, size = 84, label }: { value: string; size?: number;
  /** What scanning it does, for anyone who cannot see the code. */
  label?: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true;
    // Fetched only when a code is actually drawn. Imported at the top, the
    // library rode along in the bundle for slips, labels, reports and the
    // letterhead editor, most of which never show one.
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0f172a', light: '#ffffff' } }))
      .then((url) => { if (alive) setSrc(url); })
      .catch(() => { if (alive) setSrc(''); });
    return () => { alive = false; };
  }, [value, size]);

  if (!src) return <div className="skeleton" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt={label ?? 'Verification QR'} title={label} className="rounded-md" />;
}
