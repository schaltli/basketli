import {
  clampParams,
  DEFAULTS,
  DIVIDER_STYLES,
  HANDLE_MODES,
  WALL_STYLES,
  WEAVE_MATERIALS,
  type BasketParams,
  type Notice,
} from '../geometry/params';

/** Version of the URL format; bump when keys or meanings change. */
export const URL_VERSION = 1;

type Kind =
  | { type: 'number' }
  | { type: 'bool' }
  | { type: 'list' }
  | { type: 'enum'; values: readonly string[] };

/** Allowed values for string-valued parameters, by dotted path. */
const ENUMS: Record<string, readonly string[]> = {
  wallStyle: WALL_STYLES,
  handles: HANDLE_MODES,
  dividerStyle: DIVIDER_STYLES,
  'weave.material': WEAVE_MATERIALS,
};

/** Every parameter as a dotted path (e.g. "weave.rowGap") with its kind. */
export const FIELDS: { path: string; kind: Kind }[] = (() => {
  const out: { path: string; kind: Kind }[] = [];
  const walk = (obj: Record<string, unknown>, prefix: string) => {
    for (const [k, v] of Object.entries(obj)) {
      const path = prefix ? `${prefix}.${k}` : k;
      if (Array.isArray(v)) out.push({ path, kind: { type: 'list' } });
      else if (typeof v === 'number') out.push({ path, kind: { type: 'number' } });
      else if (typeof v === 'boolean') out.push({ path, kind: { type: 'bool' } });
      else if (typeof v === 'string')
        out.push({ path, kind: { type: 'enum', values: ENUMS[path] ?? [v] } });
      else if (v && typeof v === 'object') walk(v as Record<string, unknown>, path);
    }
  };
  walk(DEFAULTS as unknown as Record<string, unknown>, '');
  return out;
})();

function get(p: BasketParams, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)[k], p);
}

function set(p: BasketParams, path: string, value: unknown): void {
  const keys = path.split('.');
  const last = keys.pop()!;
  const parent = keys.reduce<Record<string, unknown>>(
    (o, k) => o[k] as Record<string, unknown>,
    p as unknown as Record<string, unknown>,
  );
  parent[last] = value;
}

const clone = (p: BasketParams): BasketParams => structuredClone(p);

/** Query string with the version and every value that differs from the default. */
export function serialize(p: BasketParams): string {
  const q = new URLSearchParams();
  q.set('v', String(URL_VERSION));
  for (const { path, kind } of FIELDS) {
    const value = get(p, path);
    if (kind.type === 'list') {
      // number lists as "40,85.5"
      const list = value as number[];
      if (list.join(',') !== (get(DEFAULTS, path) as number[]).join(','))
        q.set(path, list.join(','));
      continue;
    }
    if (value === get(DEFAULTS, path)) continue;
    q.set(path, kind.type === 'bool' ? (value ? '1' : '0') : String(value));
  }
  return q.toString();
}

/**
 * Reads parameters from a query string. Unknown keys and invalid values are
 * reported and fall back to the defaults; the result is always clamped.
 */
export function parse(search: string): { params: BasketParams; notices: Notice[] } {
  const q = new URLSearchParams(search);
  const p = clone(DEFAULTS);
  const notices: Notice[] = [];
  const known = new Map(FIELDS.map((f) => [f.path, f.kind]));

  for (const [key, raw] of q) {
    if (key === 'v') continue;
    const kind = known.get(key);
    if (!kind) {
      notices.push({ field: key, kind: 'unknown', value: raw });
      continue;
    }
    if (kind.type === 'list') {
      const items = raw.trim() === '' ? [] : raw.split(',').map(Number);
      if (items.every(Number.isFinite)) set(p, key, items);
      else notices.push({ field: key, kind: 'invalid', value: '' });
    } else if (kind.type === 'number') {
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(n))
        notices.push({ field: key, kind: 'invalid', value: String(get(DEFAULTS, key)) });
      else set(p, key, n);
    } else if (kind.type === 'bool') {
      if (raw === '1' || raw === '0') set(p, key, raw === '1');
      else notices.push({ field: key, kind: 'invalid', value: String(get(DEFAULTS, key)) });
    } else if (kind.values.includes(raw)) {
      set(p, key, raw);
    } else {
      notices.push({ field: key, kind: 'invalid', value: String(get(DEFAULTS, key)) });
    }
  }
  const clamped = clampParams(p);
  return { params: clamped.params, notices: [...notices, ...clamped.notices] };
}
