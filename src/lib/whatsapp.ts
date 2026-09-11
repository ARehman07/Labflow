/**
 * A WhatsApp "click to chat" link: opens WhatsApp on the counter's phone or
 * desktop with the message already written. Nothing is sent without a person
 * pressing send, and no WhatsApp Business account is needed to use it.
 */
export function whatsappLink(mobile: string, message: string): string | null {
  const digits = mobile.replace(/\D/g, '');
  // Pakistani mobiles are stored as 03XXXXXXXXX; WhatsApp wants 923XXXXXXXXX.
  const intl = digits.startsWith('0') ? `92${digits.slice(1)}` : digits;
  if (intl.length < 11) return null;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}
