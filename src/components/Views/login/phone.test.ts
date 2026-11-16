import { describe, expect, it } from 'vitest';
import { isPhoneInputValid, normalizePhoneInput } from './phone';

describe('normalisation des numéros avant validation', () => {
  it.each(['0612345678', '+212 612 345 678', '00212 612345678', '212612345678', '612 345 678', '٠٦١٢٣٤٥٦٧٨', '۰۶۱۲۳۴۵۶۷۸'])(
    'normalise %s sans perdre le dernier chiffre', raw => {
      expect(normalizePhoneInput(raw, '+212')).toBe('612345678');
      expect(isPhoneInputValid(normalizePhoneInput(raw, '+212'), '+212')).toBe(true);
    },
  );
  it.each([['+33 6 12 34 56 78', '+33', '612345678'], ['+1 514 555 0100', '+1', '5145550100'], ['+34 612345678', '+34', '612345678']])(
    'normalise le format international %s', (raw, dial, expected) => expect(normalizePhoneInput(raw, dial)).toBe(expected),
  );
  it('ne tronque pas silencieusement les numéros trop longs', () => {
    const phone = normalizePhoneInput('061234567890', '+212');
    expect(phone).toBe('61234567890');
    expect(isPhoneInputValid(phone, '+212')).toBe(false);
  });
  it('refuse un indicatif différent même si le nombre de chiffres correspond', () => {
    expect(isPhoneInputValid(normalizePhoneInput('+341234567', '+212'), '+212')).toBe(false);
  });
  it('refuse les saisies incomplètes ou un pays inconnu', () => {
    expect(isPhoneInputValid('', '+212')).toBe(false);
    expect(isPhoneInputValid('61234567', '+212')).toBe(false);
    expect(isPhoneInputValid('612345678', '+999')).toBe(false);
  });
  it('laisse saisir 0 puis 00 avant le reste du numéro sans bloquer le clavier', () => {
    expect(normalizePhoneInput('0', '+212')).toBe('0');
    expect(normalizePhoneInput('00', '+212')).toBe('00');
    expect(normalizePhoneInput('06', '+212')).toBe('6');
    expect(normalizePhoneInput('2120612345678', '+212')).toBe('612345678');
    expect(isPhoneInputValid('0', '+212')).toBe(false);
    expect(isPhoneInputValid('00', '+212')).toBe(false);
  });
});
