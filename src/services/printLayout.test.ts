import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_PRINT_LAYOUT, deletePrintPreset, loadPrintLayout, loadPrintPresets, pageBoxMm, printLayoutVars, printPageCss, savePrintLayout, savePrintPreset, sessionPrintLayout } from './printLayout';

describe('printLayout', () => {
  const values = new Map<string, string>();

  beforeEach(() => {
    values.clear();
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => values.set(key, value)),
      removeItem: vi.fn((key: string) => values.delete(key)),
    });
  });

  it('produces the portrait and landscape @page rules', () => {
    expect(printPageCss(DEFAULT_PRINT_LAYOUT)).toBe('@page { size: A4; margin: 14mm 14mm 18mm; }');
    expect(printPageCss({ ...DEFAULT_PRINT_LAYOUT, page: { ...DEFAULT_PRINT_LAYOUT.page, orientation: 'landscape', marginTop: 12, marginSide: 10, marginBottom: 16 } }))
      .toBe('@page { size: A4 landscape; margin: 12mm 10mm 16mm; }');
  });

  it('maps layout values to print variables', () => {
    const layout = { ...DEFAULT_PRINT_LAYOUT, page: { ...DEFAULT_PRINT_LAYOUT.page, columns: 2 as const, columnRule: true }, type: { ...DEFAULT_PRINT_LAYOUT.type, fontSize: 11 }, color: { ...DEFAULT_PRINT_LAYOUT.color, paper: 'cream' as const } };
    const vars = printLayoutVars(layout) as Record<string, string | number>;
    expect(vars['--print-font-size']).toBe('11pt');
    expect(vars['--print-columns']).toBe(2);
    expect(vars['--print-paper']).toBe('#fdfaf3');
    expect(vars['--print-column-rule']).toContain('solid');
  });

  it('round-trips the last used layout', () => {
    const layout = { ...DEFAULT_PRINT_LAYOUT, content: { ...DEFAULT_PRINT_LAYOUT.content, startIndex: 7, showCorrections: true } };
    savePrintLayout(layout);
    expect(loadPrintLayout().content).toMatchObject({ startIndex: 7, showCorrections: true });
  });

  it('starts a session in one column without changing the Studio layout', () => {
    const studio = { ...DEFAULT_PRINT_LAYOUT, page: { ...DEFAULT_PRINT_LAYOUT.page, columns: 2 as const, columnRule: true } };
    savePrintLayout(studio);
    const session = sessionPrintLayout(loadPrintLayout());
    expect(session.page).toMatchObject({ columns: 1, columnRule: false });
    expect(session.type).toEqual(studio.type);
    expect(loadPrintLayout().page.columns).toBe(2);
    expect(sessionPrintLayout(studio, 2).page).toMatchObject({ columns: 2, columnRule: true });
  });

  it('saves, reloads and deletes a named preset', () => {
    const saved = savePrintPreset('Mon devoir', { ...DEFAULT_PRINT_LAYOUT, page: { ...DEFAULT_PRINT_LAYOUT.page, orientation: 'landscape' } });
    expect(loadPrintPresets()).toEqual([expect.objectContaining({ id: saved.id, name: 'Mon devoir', layout: expect.objectContaining({ page: expect.objectContaining({ orientation: 'landscape' }) }) })]);
    deletePrintPreset(saved.id);
    expect(loadPrintPresets()).toEqual([]);
  });

  it('falls back safely when storage contains corrupted JSON', () => {
    values.set('mathplus:prof-print-layout', '{broken');
    expect(loadPrintLayout()).toMatchObject(DEFAULT_PRINT_LAYOUT);
  });

  it('reports physical page and content dimensions', () => {
    expect(pageBoxMm(DEFAULT_PRINT_LAYOUT)).toEqual({ width: 210, height: 297, contentWidth: 182, contentHeight: 265 });
  });
});
