/**
 * Loader for public/model/meta.json, written by export/scripts/export_meta.py (C2.3).
 *
 * The file is validated on load so that a stale or truncated asset fails loudly instead of
 * producing wrong predictions later.
 */

export const META_SCHEMA = 'antenna_gnn.meta/v1';
export const NUM_FREQ = 201;

export interface GridScope {
  test_set: string;
  n_test: number;
  test_mse_db2: number;
  test_mae_db: number;
}

export interface ModelMeta {
  schema: string;
  export_date: string;
  model: {
    architecture: string;
    parameter_count: number;
    checkpoint: string;
    checkpoint_sha256: string;
    run_id: string;
  };
  onnx: {
    file: string;
    sha256: string;
    size_bytes: number;
    opset: number;
    input_order: string[];
    denormalise: string;
  };
  /** 201 frequencies in GHz, 1 to 4. */
  freq_ghz: number[];
  /** Exact float32 de-normalisation statistics: dB = z * s11_std + s11_mean. */
  s11_mean: number[];
  s11_std: number[];
  grids: number[];
  /** Per grid (key "12", "15", ...): N*N flattened row-major 0/1 values. */
  seed_masks: Record<string, number[]>;
  /** Per grid: 0-based [row, col] of the feed pixel. */
  feed_rc: Record<string, [number, number]>;
  feature_columns: string[];
  rules: {
    functioning: string;
    functioning_threshold_db: number;
    band: { find_peaks_on: string; height: number; prominence: number; distance: number };
    fill_warning_range: [number, number];
  };
  scope: {
    trained_on: string;
    source_chunk: number;
    multi_band: string;
    test: Record<string, GridScope>;
  };
}

export class MetaError extends Error {
  override name = 'MetaError';
}

function fail(message: string): never {
  throw new MetaError(`meta.json: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function numberArray(value: unknown, name: string, length?: number): number[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'number' && Number.isFinite(v))) {
    fail(`${name} must be an array of finite numbers`);
  }
  if (length !== undefined && value.length !== length) {
    fail(`${name} must have ${length} values, got ${value.length}`);
  }
  return value as number[];
}

/** Validates the parsed JSON and returns it typed. Throws MetaError on any inconsistency. */
export function parseMeta(raw: unknown): ModelMeta {
  if (!isRecord(raw)) fail('not a JSON object');
  if (raw.schema !== META_SCHEMA) fail(`schema must be "${META_SCHEMA}", got ${JSON.stringify(raw.schema)}`);

  const grids = numberArray(raw.grids, 'grids');
  if (grids.length === 0 || !grids.every((n) => Number.isInteger(n) && n > 1))
    fail('grids must be integers > 1');
  numberArray(raw.freq_ghz, 'freq_ghz', NUM_FREQ);
  numberArray(raw.s11_mean, 's11_mean', NUM_FREQ);
  const std = numberArray(raw.s11_std, 's11_std', NUM_FREQ);
  if (!std.every((s) => s > 0)) fail('s11_std must be positive');

  if (!isRecord(raw.seed_masks) || !isRecord(raw.feed_rc)) fail('seed_masks and feed_rc must be objects');
  for (const N of grids) {
    const mask = numberArray(raw.seed_masks[String(N)], `seed_masks.${N}`, N * N);
    if (!mask.every((v) => v === 0 || v === 1)) fail(`seed_masks.${N} must contain only 0/1`);
    const feed = numberArray(raw.feed_rc[String(N)], `feed_rc.${N}`, 2);
    const [row, col] = feed as [number, number];
    if (!(Number.isInteger(row) && Number.isInteger(col) && row >= 0 && col >= 0 && row < N && col < N)) {
      fail(`feed_rc.${N} is outside the ${N}x${N} grid`);
    }
  }

  if (!isRecord(raw.model) || typeof raw.model.parameter_count !== 'number')
    fail('model.parameter_count missing');
  if (!isRecord(raw.onnx) || typeof raw.onnx.file !== 'string') fail('onnx.file missing');
  if (!isRecord(raw.scope) || !isRecord(raw.scope.test)) fail('scope.test missing');
  return raw as unknown as ModelMeta;
}

/** URL of meta.json under the app's base path (import.meta.env.BASE_URL in the app). */
export function metaUrl(baseUrl: string): string {
  return `${baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`}model/meta.json`;
}

export async function loadMeta(
  baseUrl: string = import.meta.env.BASE_URL,
  fetchFn: typeof fetch = fetch,
): Promise<ModelMeta> {
  const url = metaUrl(baseUrl);
  const response = await fetchFn(url);
  if (!response.ok) throw new MetaError(`meta.json: HTTP ${response.status} for ${url}`);
  return parseMeta(await response.json());
}
