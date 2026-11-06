/**
 * Share links (C5.5): the board's grid size and pixels in the URL hash, so a link restores the exact
 * pattern (and so the exact prediction).
 *
 * Format: `p=v1.<N>.<payload>`, where payload is the N² pixels as a bitset (row-major, pixel k in byte
 * k >> 3 at bit 7 - (k & 7), i.e. most significant bit first; unused bits of the last byte are 0),
 * base64url-encoded without padding. 25×25 takes 79 bytes, 106 characters.
 *
 * decodeShare returns null when the hash holds no pattern at all, and { ok: false, reason } with a
 * readable reason for anything malformed (the app shows it and starts a fresh grid).
 */
import { fromCells, type Grid, type GridSpec } from './grid';

const PREFIX = 'p=';
const VERSION = 'v1';

export type ShareResult = { ok: true; grid: Grid } | { ok: false; reason: string };

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Bytes from base64url (no padding), or null for any character or length that is not valid. */
function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text) || text.length % 4 === 1) return null;
  try {
    const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

export function encodeShare(grid: Grid): string {
  const { N, cells } = grid;
  const bytes = new Uint8Array(Math.ceil((N * N) / 8));
  for (let k = 0; k < cells.length; k++) {
    if (cells[k] === 1) bytes[k >> 3] = (bytes[k >> 3] ?? 0) | (0x80 >> (k & 7));
  }
  return `${PREFIX}${VERSION}.${String(N)}.${toBase64Url(bytes)}`;
}

export function decodeShare(hash: string, spec: GridSpec): ShareResult | null {
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!text.startsWith(PREFIX)) return null;

  const notOurs: ShareResult = { ok: false, reason: 'it is not a GraphPatch share link' };
  const parts = text.slice(PREFIX.length).split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return notOurs;
  const [, nText = '', payload = ''] = parts;
  if (!/^\d{1,3}$/.test(nText)) return notOurs;
  const N = Number(nText);
  if (!spec.grids.includes(N)) {
    return {
      ok: false,
      reason: `${String(N)}×${String(N)} is not supported (grids: ${spec.grids.map((g) => `${String(g)}×${String(g)}`).join(', ')})`,
    };
  }

  const damaged: ShareResult = { ok: false, reason: 'the pattern data is incomplete or damaged' };
  const bytes = fromBase64Url(payload);
  const size = Math.ceil((N * N) / 8);
  if (bytes?.length !== size) return damaged;
  const unused = size * 8 - N * N;
  if (unused > 0 && ((bytes[size - 1] ?? 0) & ((1 << unused) - 1)) !== 0) return damaged;

  const cells = Array.from({ length: N * N }, (_, k) => ((bytes[k >> 3] ?? 0) >> (7 - (k & 7))) & 1);
  try {
    return { ok: true, grid: fromCells(N, cells, spec) };
  } catch {
    return { ok: false, reason: 'a seed pixel is air (seed pixels are always metal)' };
  }
}
