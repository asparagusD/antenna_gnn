import { describe, expect, it, vi } from 'vitest';
import committedMeta from '../../public/model/meta.json';
import { loadMeta, MetaError, metaUrl, parseMeta } from './meta';

/** A deep copy of the committed meta.json that a test may mutate. */
function metaCopy(): Record<string, unknown> {
  const copy: Record<string, unknown> = structuredClone(committedMeta);
  return copy;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('parseMeta', () => {
  it('accepts the committed meta.json', () => {
    const meta = parseMeta(metaCopy());
    expect(meta.grids).toEqual([12, 15, 25, 35, 45]);
    expect(meta.model.parameter_count).toBe(587_129);
    expect(meta.model.checkpoint).toBe('ch52_bal_ft45_s0.pt');
    expect(meta.freq_ghz).toHaveLength(201);
    expect(meta.freq_ghz[0]).toBe(1);
    expect(meta.freq_ghz[200]).toBe(4);
    for (const N of meta.grids) {
      expect(meta.seed_masks[String(N)]).toHaveLength(N * N);
    }
  });

  it.each([
    ['a wrong schema', (m: Record<string, unknown>) => (m.schema = 'antenna_gnn.meta/v0'), /schema/],
    [
      'truncated statistics',
      (m: Record<string, unknown>) => (m.s11_std = [1, 2, 3]),
      /s11_std must have 201/,
    ],
    [
      'a non-positive std',
      (m: Record<string, unknown>) => (m.s11_std = new Array<number>(201).fill(0)),
      /positive/,
    ],
    [
      'a seed mask of the wrong size',
      (m: Record<string, unknown>) => ((m.seed_masks as Record<string, unknown>)['12'] = [1, 0]),
      /seed_masks\.12 must have 144/,
    ],
    [
      'a feed pixel outside the grid',
      (m: Record<string, unknown>) => ((m.feed_rc as Record<string, unknown>)['12'] = [12, 0]),
      /outside the 12x12 grid/,
    ],
  ])('rejects %s', (_label, mutate, message) => {
    const meta = metaCopy();
    mutate(meta);
    expect(() => parseMeta(meta)).toThrow(MetaError);
    expect(() => parseMeta(meta)).toThrow(message);
  });

  it('rejects a non-object', () => {
    expect(() => parseMeta([1, 2, 3])).toThrow(/not a JSON object/);
  });
});

describe('metaUrl', () => {
  it('builds the URL under the base path', () => {
    expect(metaUrl('/')).toBe('/model/meta.json');
    expect(metaUrl('/graphpatch/')).toBe('/graphpatch/model/meta.json');
    expect(metaUrl('/graphpatch')).toBe('/graphpatch/model/meta.json');
  });
});

describe('loadMeta', () => {
  it('fetches meta.json under the base path and validates it', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(jsonResponse(committedMeta)));
    const meta = await loadMeta('/graphpatch/', fetchFn);
    expect(fetchFn).toHaveBeenCalledWith('/graphpatch/model/meta.json');
    expect(meta.grids).toHaveLength(5);
  });

  it('reports an HTTP error with the URL', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(new Response('missing', { status: 404 })));
    await expect(loadMeta('/', fetchFn as unknown as typeof fetch)).rejects.toThrow(
      'meta.json: HTTP 404 for /model/meta.json',
    );
  });

  it('rejects an invalid payload', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(jsonResponse({ schema: 'nope' })));
    await expect(loadMeta('/', fetchFn as unknown as typeof fetch)).rejects.toThrow(MetaError);
  });
});
