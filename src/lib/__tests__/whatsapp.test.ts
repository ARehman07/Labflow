import { describe, expect, it } from 'vitest';
import { whatsappLink } from '../whatsapp';

describe('whatsappLink', () => {
  it('turns a local Pakistani mobile into international form', () => {
    expect(whatsappLink('03001234567', 'hi')).toBe('https://wa.me/923001234567?text=hi');
  });

  it('keeps a number already in international form', () => {
    expect(whatsappLink('923001234567', 'hi')).toBe('https://wa.me/923001234567?text=hi');
  });

  it('ignores spaces, dashes and a leading plus', () => {
    expect(whatsappLink('+92 300-123 4567', 'hi')).toBe('https://wa.me/923001234567?text=hi');
  });

  it('encodes the message so links and spaces survive', () => {
    const link = whatsappLink('03001234567', 'Report ready: https://lab.pk/portal?lab=demo')!;
    expect(decodeURIComponent(link.split('text=')[1])).toBe('Report ready: https://lab.pk/portal?lab=demo');
  });

  it('refuses a number too short to be a mobile', () => {
    expect(whatsappLink('12345', 'hi')).toBeNull();
  });
});
