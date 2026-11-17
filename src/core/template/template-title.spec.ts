import { renderTemplateTitle } from './template-title';

// 2026-11-17T20:30Z is already 2026-11-18 in Ho Chi Minh (UTC+7).
const lateEvening = new Date('2026-11-17T20:30:00Z');
const midday = new Date('2026-11-17T05:00:00Z');
const hcm = { timeZone: 'Asia/Ho_Chi_Minh', locale: 'vi-VN' };

describe('date placeholders in a template title', () => {
  it('fills in the day in the configured zone, not in UTC', () => {
    expect(renderTemplateTitle('{dd/mm/yyyy}', midday, hcm)).toBe('17/11/2026');
    expect(renderTemplateTitle('{dd/mm/yyyy}', lateEvening, hcm)).toBe(
      '18/11/2026',
    );
  });

  it('keeps the words around the placeholder', () => {
    expect(
      renderTemplateTitle('[VinSOC] công việc ngày {dd/mm/yyyy}', midday, hcm),
    ).toBe('[VinSOC] công việc ngày 17/11/2026');
  });

  it('understands the other date shapes', () => {
    expect(renderTemplateTitle('{date}', midday, hcm)).toBe('2026-11-17');
    expect(renderTemplateTitle('{yyyy-mm-dd}', midday, hcm)).toBe('2026-11-17');
    expect(renderTemplateTitle('{dd-mm-yyyy}', midday, hcm)).toBe('17-11-2026');
    expect(renderTemplateTitle('{mm/yyyy}', midday, hcm)).toBe('11/2026');
    expect(renderTemplateTitle('{yyyy}/{mm}/{dd}', midday, hcm)).toBe(
      '2026/11/17',
    );
  });

  it('ignores the case and stray spaces inside the braces', () => {
    expect(renderTemplateTitle('{ DD/MM/YYYY }', midday, hcm)).toBe(
      '17/11/2026',
    );
  });

  it('writes {day} the way the language writes a date', () => {
    expect(
      renderTemplateTitle('[VinSOC] công việc ngày {DAY}', midday, hcm),
    ).toBe('[VinSOC] công việc ngày 17/11/2026');

    expect(
      renderTemplateTitle('{day}', midday, {
        timeZone: 'Asia/Ho_Chi_Minh',
        locale: 'en-US',
      }),
    ).toBe('11/17/2026');
  });

  it('keeps the century in {day}', () => {
    // a "short" date drops it in several languages; a page titled 17/11/26
    // next to one titled 17/11/2026 reads and sorts badly
    expect(renderTemplateTitle('{day}', midday, hcm)).toContain('2026');
  });

  it('reads {day} in the configured zone', () => {
    expect(renderTemplateTitle('{day}', lateEvening, hcm)).toBe('18/11/2026');
  });

  it('leaves a name it does not know exactly as typed', () => {
    // what was actually written by hand before this existed
    expect(
      renderTemplateTitle('[VinSOC] công việc ngày {DAYS}', midday, hcm),
    ).toBe('[VinSOC] công việc ngày {DAYS}');
  });

  it('leaves a title with no braces alone', () => {
    expect(renderTemplateTitle('Khung task hàng ngày', midday, hcm)).toBe(
      'Khung task hàng ngày',
    );
  });

  it('survives an empty or missing title', () => {
    expect(renderTemplateTitle('', midday, hcm)).toBe('');
    expect(renderTemplateTitle(undefined as any, midday, hcm)).toBe('');
  });

  it('falls back to UTC rather than throwing on a bad zone', () => {
    expect(
      renderTemplateTitle('{date}', midday, {
        timeZone: 'Not/AZone',
        locale: 'vi-VN',
      }),
    ).toBe('2026-11-17');
  });

  it('renders the weekday in the configured language', () => {
    const vi = renderTemplateTitle('{weekday}', midday, hcm);
    const en = renderTemplateTitle('{weekday}', midday, {
      timeZone: 'Asia/Ho_Chi_Minh',
      locale: 'en-GB',
    });
    expect(en).toBe('Tuesday');
    expect(vi).not.toBe('');
    expect(vi).not.toBe('{weekday}');
  });
});
