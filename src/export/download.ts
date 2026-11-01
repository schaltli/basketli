import type { BasketParams } from '../geometry/params';

const mm = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** e.g. basketli_150x100x80.stl */
export function exportFileName(p: BasketParams, ext: 'stl' | '3mf'): string {
  return `basketli_${mm(p.width)}x${mm(p.depth)}x${mm(p.height)}.${ext}`;
}

/** Triggers a browser download of `data`. */
export function saveFile(data: Uint8Array, fileName: string, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
