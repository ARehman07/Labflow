'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders a QR code as a data-URL image (generated client-side). */
export function QrCode({ value, size = 84 }: { value: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: size, color: { dark: '#0f172a', light: '#ffffff' } })
      .then(setSrc)
      .catch(() => setSrc(''));
  }, [value, size]);

  if (!src) return <div className="skeleton" style={{ width: size, height: size }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} width={size} height={size} alt="Verification QR" className="rounded-md" />;
}
