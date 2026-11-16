/** Formats acceptés par l'interface ; le serveur reste responsable de la validation. */
export const PHONE_COUNTRIES = [
  { name: 'Maroc', ar: 'المغرب', dial: '+212', digits: 9, trunk: true },
  { name: 'France', ar: 'فرنسا', dial: '+33', digits: 9, trunk: true },
  { name: 'Belgique', ar: 'بلجيكا', dial: '+32', digits: 9, trunk: true },
  { name: 'Espagne', ar: 'إسبانيا', dial: '+34', digits: 9, trunk: false },
  { name: 'Canada', ar: 'كندا', dial: '+1', digits: 10, trunk: false },
] as const;

export type PhoneCountry = typeof PHONE_COUNTRIES[number];

export function normalizePhoneInput(raw: string, dial: string): string {
  const country = PHONE_COUNTRIES.find(item => item.dial === dial);
  const trimmed = raw.trim();
  let digits = raw.replace(/[٠-٩۰-۹]/g, char => String(char.charCodeAt(0) - (char <= '٩' ? 0x660 : 0x6f0))).replace(/\D/g, '');
  const prefix = dial.replace('+', '');
  const international = trimmed.startsWith('+') || trimmed.startsWith('00');

  // Laisse saisir « 0 » ou « 00 » caractère par caractère avant de normaliser.
  if (!trimmed.startsWith('+') && (digits === '0' || digits === '00')) {
    return digits;
  }

  if (trimmed.startsWith('00')) digits = digits.slice(2);
  // Ne jamais tronquer un numéro trop long : la validation doit le signaler.
  if (international) {
    if (!digits.startsWith(prefix)) return `+${digits}`; // indicatif différent : garder une valeur explicitement invalide
    digits = digits.slice(prefix.length);
  } else if (country && prefix && digits.startsWith(prefix)) {
    const withPrefixTrunk = country.trunk && digits.startsWith(`${prefix}0`) && digits.length === country.digits + prefix.length + 1;
    const withPrefix = digits.length === country.digits + prefix.length;
    if (withPrefixTrunk || withPrefix) {
      digits = digits.slice(prefix.length);
    }
  }
  if (country?.trunk && digits.startsWith('0')) digits = digits.slice(1);
  return digits;
}

export function isPhoneInputValid(phone: string, dial: string): boolean {
  const country = PHONE_COUNTRIES.find(item => item.dial === dial);
  return !!country && /^\d+$/.test(phone) && phone.length === country.digits;
}
