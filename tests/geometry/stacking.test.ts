import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildManifold } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  type BasketParams,
  type WallStyle,
} from '../../src/geometry/params';
import { overhangReport } from '../../src/geometry/printability';
import {
  FOOT_HEIGHT,
  footInset,
  socketTop,
  STACK_INSET,
  stackPitch,
  wallIntrusion,
} from '../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (wallStyle: WallStyle, rowGap = 0): BasketParams =>
  clampParams({
    ...DEFAULTS,
    width: 80,
    depth: 60,
    height: 40,
    handles: 'none',
    stackable: true,
    wallStyle,
    weave: { ...DEFAULTS.weave, rowGap },
  }).params;

const styles: [string, BasketParams][] = [
  ['Streckmetall', basket('expanded')],
  ['Waben', basket('hex')],
  ['Voronoi', basket('voronoi')],
  ['Geflecht geschlossen', basket('weave')],
  ['Geflecht offen', basket('weave', 4)],
];

describe('stacking interface', () => {
  it.each(styles)('%s: wall reaches at most STACK_INSET in from the outline', (_n, p) => {
    expect(wallIntrusion(p)).toBeLessThanOrEqual(STACK_INSET + 1e-9);
  });

  it.each(styles)('%s: drawn-in foot, full size above, height H, one body', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.max[2]).toBeCloseTo(p.height, 3);
      expect(box.min[2]).toBeCloseTo(0, 6);
      const foot = m.slice(FOOT_HEIGHT / 2).bounds();
      expect(foot.max[0]).toBeCloseTo(p.width / 2 - footInset(p), 1);
      expect(foot.max[1]).toBeCloseTo(p.depth / 2 - footInset(p), 1);
    } finally {
      m.delete();
    }
  });

  it.each(styles)('%s: socket prints without support', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      // only the socket zone (the rest is covered by the style tests)
      const cut = wasm.Manifold.cube([1000, 1000, FOOT_HEIGHT + footInset(p) + 2]).translate([
        -500, -500, 0,
      ]);
      const socket = m.intersect(cut);
      expect(overhangReport(socket).maxArea).toBeLessThan(0.5);
      socket.delete();
      cut.delete();
    } finally {
      m.delete();
    }
  });
});

/**
 * Normals of all triangles lying wholly in the socket zone. The socket only
 * has vertical walls, horizontal floors and the 45° chamfer, so any other
 * normal is a sliver from a boolean (bug seen at 150×100×80, radius 15).
 */
function oddSocketFaces(m: Manifold, p: BasketParams): number {
  const mesh = m.getMesh();
  const v = mesh.vertProperties;
  const n = mesh.numProp;
  const t = mesh.triVerts;
  const top = socketTop(p) - 1e-4;
  let odd = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i]! * n, t[i + 1]! * n, t[i + 2]! * n];
    if (v[a + 2]! > top || v[b + 2]! > top || v[c + 2]! > top) continue;
    const u = [v[b]! - v[a]!, v[b + 1]! - v[a + 1]!, v[b + 2]! - v[a + 2]!];
    const w = [v[c]! - v[a]!, v[c + 1]! - v[a + 1]!, v[c + 2]! - v[a + 2]!];
    const cx = u[1]! * w[2]! - u[2]! * w[1]!;
    const cy = u[2]! * w[0]! - u[0]! * w[2]!;
    const cz = u[0]! * w[1]! - u[1]! * w[0]!;
    const len = Math.hypot(cx, cy, cz);
    if (len < 1e-9) continue;
    const nz = cz / len;
    const ok =
      Math.abs(nz) < 0.02 ||
      Math.abs(Math.abs(nz) - 1) < 0.02 ||
      Math.abs(Math.abs(nz) - Math.SQRT1_2) < 0.02;
    if (!ok) odd++;
  }
  return odd;
}

describe('socket surface', () => {
  const reported = clampParams({
    ...DEFAULTS,
    width: 150,
    depth: 100,
    height: 80,
    cornerRadius: 15,
    floor: 2,
    wall: 2,
    webWidth: 3.6,
    wallStyle: 'voronoi',
  }).params;
  const cases: [string, BasketParams][] = [['Voronoi 150×100×80 r15', reported], ...styles];
  it.each(cases)('%s: only vertical, horizontal and 45° faces', (_n, p) => {
    // Weave and expanded exports are simplified (EXPORT_TOLERANCE), which may
    // tilt long foot faces by a few hundredths of a mm – that is intended.
    const simplified = p.wallStyle === 'weave' || p.wallStyle === 'expanded';
    const qualities = simplified ? (['preview'] as const) : (['preview', 'export'] as const);
    for (const q of qualities) {
      const m = buildManifold(wasm, p, q);
      try {
        expect(oddSocketFaces(m, p), q).toBe(0);
      } finally {
        m.delete();
      }
    }
  });
});

/**
 * Upward-facing flat area inside the basket between the floor and the top of
 * the socket, further in than the wall reaches: the step from the socket
 * ring to the thinner wall. It should be a 45° chamfer instead.
 */
function innerLedgeArea(m: Manifold, p: BasketParams): number {
  const mesh = m.getMesh();
  const v = mesh.vertProperties;
  const n = mesh.numProp;
  const t = mesh.triVerts;
  const r = p.cornerRadius;
  const inset = (x: number, y: number) => {
    const ax = Math.abs(x);
    const ay = Math.abs(y);
    const cx = p.width / 2 - r;
    const cy = p.depth / 2 - r;
    if (ax > cx && ay > cy) return r - Math.hypot(ax - cx, ay - cy);
    return Math.min(p.width / 2 - ax, p.depth / 2 - ay);
  };
  const reach = Math.max(wallIntrusion(p), 1.6) + 0.1;
  let area = 0;
  for (let i = 0; i < t.length; i += 3) {
    const [a, b, c] = [t[i]! * n, t[i + 1]! * n, t[i + 2]! * n];
    const z = (v[a + 2]! + v[b + 2]! + v[c + 2]!) / 3;
    if (z < p.floor + 0.01 || z > socketTop(p) + 0.01) continue;
    const u = [v[b]! - v[a]!, v[b + 1]! - v[a + 1]!, v[b + 2]! - v[a + 2]!];
    const w = [v[c]! - v[a]!, v[c + 1]! - v[a + 1]!, v[c + 2]! - v[a + 2]!];
    const cx = u[1]! * w[2]! - u[2]! * w[1]!;
    const cy = u[2]! * w[0]! - u[0]! * w[2]!;
    const cz = u[0]! * w[1]! - u[1]! * w[0]!;
    const len = Math.hypot(cx, cy, cz);
    if (len < 1e-12 || cz / len < 0.99) continue;
    const x = (v[a]! + v[b]! + v[c]!) / 3;
    const y = (v[a + 1]! + v[b + 1]! + v[c + 1]!) / 3;
    if (inset(x, y) > reach) area += len / 2;
  }
  return area;
}

describe('socket inside', () => {
  it.each(styles)('%s: no flat ledge between socket ring and wall', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(innerLedgeArea(m, p)).toBeLessThan(0.5);
    } finally {
      m.delete();
    }
  });
});

/** Largest overlap volume when `upper` is lifted by dz onto `lower`. */
function overlap(lower: Manifold, upper: Manifold, dz: number): number {
  const lifted = upper.translate([0, 0, dz]);
  const both = lower.intersect(lifted);
  const v = both.volume();
  both.delete();
  lifted.delete();
  return v;
}

describe('cross-style stacking', () => {
  const pairs: [string, string][] = [
    ['Streckmetall', 'Streckmetall'],
    ['Geflecht geschlossen', 'Streckmetall'],
    ['Streckmetall', 'Geflecht offen'],
    ['Voronoi', 'Geflecht geschlossen'],
    ['Waben', 'Voronoi'],
    ['Geflecht offen', 'Waben'],
  ];
  const byName = Object.fromEntries(styles);

  it.each(pairs)('%s below, %s on top: nests, rests on the chamfer, no collision', (lo, up) => {
    const pl = byName[lo]!;
    const pu = byName[up]!;
    const lower = buildManifold(wasm, pl, 'preview');
    const upper = buildManifold(wasm, pu, 'preview');
    try {
      const pitch = stackPitch(pl, pu);
      expect(pitch).toBeLessThan(pl.height); // the foot really nests
      expect(overlap(lower, upper, pitch + 0.05)).toBeLessThan(0.5); // sits without collision
      expect(overlap(lower, upper, pitch - 0.4)).toBeGreaterThan(0.5); // and actually rests there
      // lateral: the foot is inside the lower basket's opening
      const opening = lower.slice(pl.height - 0.1).bounds();
      const foot = upper.slice(FOOT_HEIGHT / 2).bounds();
      expect(foot.max[0]).toBeLessThan(opening.max[0]);
      expect(foot.min[0]).toBeGreaterThan(opening.min[0]);
    } finally {
      lower.delete();
      upper.delete();
    }
  });
});
