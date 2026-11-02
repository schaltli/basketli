import { strFromU8, unzipSync } from 'fflate';
import { beforeAll, describe, expect, it } from 'vitest';
import { toThreeMf } from '../../src/export/threemf';
import { build, type MeshData } from '../../src/geometry/build';
import { loadManifold } from '../../src/geometry/manifold';
import { clampParams, DEFAULTS } from '../../src/geometry/params';

let mesh: MeshData;
beforeAll(async () => {
  const wasm = await loadManifold();
  const p = clampParams({ ...DEFAULTS, width: 80, depth: 60, height: 40, handles: 'none' }).params;
  mesh = build(wasm, p, 'export');
});

const unpack = (zip: Uint8Array) => {
  const files = unzipSync(zip);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
};

describe('3MF export', () => {
  it('is a zip with content types, relationships and the model', () => {
    const files = unpack(toThreeMf(mesh, 'basketli 80x60x40'));
    expect(Object.keys(files).sort()).toEqual(
      ['3D/3dmodel.model', '[Content_Types].xml', '_rels/.rels'].sort(),
    );
    expect(files['[Content_Types].xml']).toContain(
      'ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"',
    );
    expect(files['_rels/.rels']).toContain('Target="/3D/3dmodel.model"');
    expect(files['_rels/.rels']).toContain(
      'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"',
    );
  });

  it('stores the mesh in millimetres with matching vertex and triangle counts', () => {
    const model = unpack(toThreeMf(mesh, 'x'))['3D/3dmodel.model']!;
    expect(model).toMatch(/<model[^>]* unit="millimeter"/);
    expect(model).toContain('xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"');
    expect(model.match(/<vertex /g)!.length).toBe(mesh.positions.length / 3);
    expect(model.match(/<triangle /g)!.length).toBe(mesh.indices.length / 3);
    expect(model).toContain('<build><item objectid="1"/></build>');
  });

  it('keeps coordinates and indices exact', () => {
    const model = unpack(toThreeMf(mesh, 'x'))['3D/3dmodel.model']!;
    const v = [...model.matchAll(/<vertex x="([^"]+)" y="([^"]+)" z="([^"]+)"\/>/g)];
    const t = [...model.matchAll(/<triangle v1="(\d+)" v2="(\d+)" v3="(\d+)"\/>/g)];
    for (const i of [0, 7, v.length - 1])
      for (let k = 0; k < 3; k++)
        expect(Number(v[i]![k + 1])).toBeCloseTo(mesh.positions[i * 3 + k]!, 4);
    for (const i of [0, 5, t.length - 1])
      for (let k = 0; k < 3; k++) expect(Number(t[i]![k + 1])).toBe(mesh.indices[i * 3 + k]);
    // outer size survives the round trip
    const xs = v.map((m) => Number(m[1]));
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(80, 2);
  });

  it('escapes the title', () => {
    const model = unpack(toThreeMf(mesh, 'a<b & "c"'))['3D/3dmodel.model']!;
    expect(model).toContain('<metadata name="Title">a&lt;b &amp; &quot;c&quot;</metadata>');
  });
});
