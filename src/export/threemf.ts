import { strToU8, zipSync } from 'fflate';
import type { MeshData } from '../geometry/build';

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>' +
  '</Types>';

const RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Target="/3D/3dmodel.model" Id="rel0" ' +
  'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>' +
  '</Relationships>';

const escapeXml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Coordinate as short text: 1e-5 mm resolution, no trailing zeros. */
const num = (v: number) => String(Math.round(v * 1e5) / 1e5);

function modelXml(mesh: MeshData, title: string): string {
  const { positions: pos, indices: idx } = mesh;
  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" ',
    'xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">',
    `<metadata name="Title">${escapeXml(title)}</metadata>`,
    '<metadata name="Application">basketli</metadata>',
    `<resources><object id="1" type="model" name="${escapeXml(title)}"><mesh><vertices>`,
  ];
  for (let i = 0; i < pos.length; i += 3)
    parts.push(`<vertex x="${num(pos[i]!)}" y="${num(pos[i + 1]!)}" z="${num(pos[i + 2]!)}"/>`);
  parts.push('</vertices><triangles>');
  for (let i = 0; i < idx.length; i += 3)
    parts.push(`<triangle v1="${idx[i]}" v2="${idx[i + 1]}" v3="${idx[i + 2]}"/>`);
  parts.push('</triangles></mesh></object></resources>');
  parts.push('<build><item objectid="1"/></build></model>');
  return parts.join('');
}

/**
 * 3MF package (core spec): one mesh object in millimetres, zipped with its
 * content types and relationships. Vertices are shared, so slicers see the
 * mesh as closed without repairing it.
 */
export function toThreeMf(mesh: MeshData, title = 'basketli'): Uint8Array {
  return zipSync(
    {
      '[Content_Types].xml': strToU8(CONTENT_TYPES),
      '_rels/.rels': strToU8(RELS),
      '3D/3dmodel.model': strToU8(modelXml(mesh, title)),
    },
    { level: 6 },
  );
}
