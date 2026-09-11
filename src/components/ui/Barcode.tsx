import { code128Widths } from '@/lib/code128';

/**
 * A Code 128 barcode as SVG, crisp at any print resolution.
 * Bars are drawn in module units with a quiet zone either side, so a
 * scanner finds the edges; the SVG is stretched to `width` / `height`.
 */
export function Barcode({
  value, height = 36, width, className, showText = false,
}: {
  value: string;
  height?: number;
  /** Rendered width in px; defaults to 1.4px per module. */
  width?: number;
  className?: string;
  showText?: boolean;
}) {
  let widths: number[];
  try { widths = code128Widths(value); } catch { return null; }
  const quiet = 10;
  const modules = widths.reduce((a, b) => a + b, 0) + quiet * 2;
  const rects: { x: number; w: number }[] = [];
  let x = quiet;
  widths.forEach((w, i) => {
    if (i % 2 === 0) rects.push({ x, w });
    x += w;
  });
  return (
    <span className={className} style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
      <svg
        role="img"
        aria-label={value}
        viewBox={`0 0 ${modules} 40`}
        preserveAspectRatio="none"
        width={width ?? Math.round(modules * 1.4)}
        height={height}
        shapeRendering="crispEdges"
      >
        <rect x="0" y="0" width={modules} height="40" fill="#fff" />
        {rects.map((r, i) => <rect key={i} x={r.x} y="0" width={r.w} height="40" fill="#000" />)}
      </svg>
      {showText && <span style={{ fontFamily: 'ui-monospace, monospace', fontSize: 9, letterSpacing: '0.08em' }}>{value}</span>}
    </span>
  );
}
