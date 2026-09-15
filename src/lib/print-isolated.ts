/**
 * Print one element without putting the page it sits on into print mode.
 *
 * window.print() lays the whole document out for paper, and while Chrome's
 * print dialog is open the tab behind it is drawn with those print styles —
 * which force the light palette so reports come out black on white. A dark-mode
 * screen therefore turned white until the dialog closed.
 *
 * Instead the element is copied into a hidden frame with the same stylesheets,
 * and that frame is printed. The printout is identical; the page itself is
 * never switched to print mode, so the screen stays as the user left it.
 */
export async function printElement(el: Element | null | undefined): Promise<void> {
  if (!el) { window.print(); return; }

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
  document.body.appendChild(frame);
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  if (!win || !doc) { frame.remove(); window.print(); return; }

  const root = document.documentElement;
  // Every stylesheet and <style> on the page, including a report's own @page
  // margins, which sit beside the sheet rather than inside it.
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('\n');
  doc.open();
  doc.write(
    `<!doctype html><html lang="${attr(root.lang || 'en')}" dir="${attr(root.dir || 'ltr')}"><head>`
    + `<meta charset="utf-8"><base href="${attr(window.location.origin)}/"><title>${text(document.title)}</title>`
    + `${styles}</head><body></body></html>`,
  );
  doc.close();

  const clone = doc.importNode(el, true) as HTMLElement;
  // A canvas copies as an empty box; carry its picture across as an image.
  const sources = el.querySelectorAll('canvas');
  clone.querySelectorAll('canvas').forEach((c, i) => {
    try {
      const img = doc.createElement('img');
      img.src = sources[i].toDataURL();
      img.className = c.className;
      img.style.cssText = c.style.cssText;
      img.width = c.width;
      img.height = c.height;
      c.replaceWith(img);
    } catch { /* a canvas we may not read stays as it is */ }
  });
  doc.body.appendChild(clone);

  // Printing before the styles, images and fonts arrive prints an unstyled page.
  // Each wait is capped so a slow or failed file never leaves Print doing nothing.
  const capped = (p: Promise<unknown>) => Promise.race([p, new Promise((r) => setTimeout(r, 3000))]);
  await capped(Promise.all([
    ...[...doc.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map((l) => (l.sheet ? null : new Promise<void>((r) => {
      l.addEventListener('load', () => r(), { once: true });
      l.addEventListener('error', () => r(), { once: true });
    }))),
    ...[...doc.images].map((img) => (img.complete ? null : img.decode().catch(() => undefined))),
  ]));
  await capped(doc.fonts?.ready ?? Promise.resolve());

  let gone = false;
  const cleanup = () => {
    if (gone) return;
    gone = true;
    setTimeout(() => frame.remove(), 500);
  };
  // Chrome holds print() until the dialog closes; Firefox and Safari return at
  // once and report the end with afterprint. The long timer only stops a frame
  // lingering if neither happens.
  win.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(cleanup, 5 * 60_000);
  win.focus();
  win.print();
}

function attr(s: string) {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function text(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}
