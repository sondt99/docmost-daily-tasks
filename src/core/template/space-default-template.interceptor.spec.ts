import { shouldFillFromTemplate } from './space-default-template.interceptor';

describe('deciding whether to fill a new page', () => {
  const body = { spaceId: '01a1e819-4a17-7e77-8d76-4dac0529689b' };

  it('fills a plain new page', () => {
    expect(shouldFillFromTemplate('POST', '/api/pages/create', body)).toBe(
      true,
    );
  });

  it('ignores the query string and a trailing slash', () => {
    expect(
      shouldFillFromTemplate('POST', '/api/pages/create/?foo=1', body),
    ).toBe(true);
  });

  it('leaves a request that already carries content alone', () => {
    expect(
      shouldFillFromTemplate('POST', '/api/pages/create', {
        ...body,
        content: { type: 'doc', content: [] },
      }),
    ).toBe(false);
  });

  it('treats a null content as no content, because that is what an empty page sends', () => {
    expect(
      shouldFillFromTemplate('POST', '/api/pages/create', {
        ...body,
        content: null,
      }),
    ).toBe(true);
  });

  it('leaves every other page endpoint alone', () => {
    for (const path of [
      '/api/pages/update',
      '/api/pages/duplicate',
      '/api/pages/import',
      '/api/templates/use',
      '/api/bases/create',
    ]) {
      expect(shouldFillFromTemplate('POST', path, body)).toBe(false);
    }
  });

  it('only acts on POST', () => {
    expect(shouldFillFromTemplate('GET', '/api/pages/create', body)).toBe(
      false,
    );
  });

  it('needs a space id to look anything up', () => {
    expect(shouldFillFromTemplate('POST', '/api/pages/create', {})).toBe(false);
    expect(
      shouldFillFromTemplate('POST', '/api/pages/create', { spaceId: '' }),
    ).toBe(false);
  });

  it('survives a body that is not an object', () => {
    for (const bad of [null, undefined, 'string', 42, []]) {
      expect(
        shouldFillFromTemplate('POST', '/api/pages/create', bad as any),
      ).toBe(false);
    }
  });

  it('survives a missing url', () => {
    expect(shouldFillFromTemplate('POST', undefined as any, body)).toBe(false);
  });
});
