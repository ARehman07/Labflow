/**
 * Save a report as a PDF or PNG file, drawn from what is on screen.
 *
 * Printing to PDF from the browser works, but it asks the counter to find the
 * right printer entry and name the file every time. These produce a file named
 * after the slip and MR number in one press, ready to attach to WhatsApp or
 * email.
 *
 * The capture always uses the light theme — a report is paper, and a dark-mode
 * screen would otherwise export white text on black.
 */
export async function exportReport(el: HTMLElement, fileBase: string, kind: 'pdf' | 'png'): Promise<void> {
  const root = document.documentElement;
  const wasDark = root.classList.contains('dark');
  const theme = root.getAttribute('data-theme');
  if (wasDark) root.classList.remove('dark');
  root.setAttribute('data-theme', 'light');
  try {
    const { toCanvas } = await import('html-to-image');
    const canvas = await toCanvas(el, {
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      cacheBust: true,
      filter: (node) => !(node instanceof HTMLElement && node.classList.contains('no-export')),
    });

    if (kind === 'png') {
      download(canvas.toDataURL('image/png'), `${fileBase}.png`);
      return;
    }

    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
    const margin = 8;
    const imgW = 210 - margin * 2;
    const pxPerMm = canvas.width / imgW;
    const pagePx = Math.floor((297 - margin * 2) * pxPerMm);
    for (let y = 0, page = 0; y < canvas.height; y += pagePx, page++) {
      const h = Math.min(pagePx, canvas.height - y);
      const slice = document.createElement('canvas');
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext('2d');
      if (!ctx) break;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL('image/jpeg', 0.92), 'JPEG', margin, margin, imgW, h / pxPerMm);
    }
    pdf.save(`${fileBase}.pdf`);
  } finally {
    if (wasDark) root.classList.add('dark');
    if (theme == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  }
}

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** "Report-00014-MR-000002" — what a patient sees in their downloads. */
export function reportFileName(slipNo: string, mrNo: string) {
  return `Report-${slipNo}-${mrNo}`.replace(/[^A-Za-z0-9._-]/g, '_');
}
