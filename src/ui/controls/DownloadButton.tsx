import { useEffect, useRef, useState } from 'react';
import { exportFileName, saveFile } from '../../export/download';
import { toStl } from '../../export/stl';
import { toThreeMf } from '../../export/threemf';
import type { MeshData } from '../../geometry/build';
import type { BasketParams } from '../../geometry/params';
import { de } from '../i18n/de';
import { geometryClient } from '../viewer/useBasketMesh';

type Format = 'stl' | '3mf';

const FORMATS: {
  format: Format;
  label: string;
  hint: string;
  mime: string;
  encode: (mesh: MeshData, title: string) => Uint8Array;
}[] = [
  { format: 'stl', label: 'STL', hint: de.downloadStlHint, mime: 'model/stl', encode: toStl },
  { format: '3mf', label: '3MF', hint: de.download3mfHint, mime: 'model/3mf', encode: toThreeMf },
];

/** "Herunterladen" menu: builds the basket in export quality as STL or 3MF. */
export function DownloadButton({ params }: { params: BasketParams }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const items = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    items.current[0]?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  const download = async (f: (typeof FORMATS)[number]) => {
    close();
    setBusy(true);
    setFailed(false);
    try {
      const { mesh } = await geometryClient().build(params, 'export');
      const name = exportFileName(params, f.format);
      saveFile(f.encode(mesh, name.replace(/\.\w+$/, '')), name, f.mime);
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const onMenuKey = (e: React.KeyboardEvent, i: number) => {
    const n = FORMATS.length;
    if (e.key === 'ArrowDown') items.current[(i + 1) % n]?.focus();
    else if (e.key === 'ArrowUp') items.current[(i + n - 1) % n]?.focus();
    else if (e.key === 'Home') items.current[0]?.focus();
    else if (e.key === 'End') items.current[n - 1]?.focus();
    else if (e.key === 'Escape' || e.key === 'Tab') close();
    else return;
    e.preventDefault();
  };

  return (
    <span className="download" ref={root}>
      <button
        ref={button}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? de.downloadBusy : de.download}
      </button>
      {open && (
        <div role="menu" className="download-menu" aria-label={de.download}>
          {FORMATS.map((f, i) => (
            <button
              key={f.format}
              ref={(el) => {
                items.current[i] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => void download(f)}
              onKeyDown={(e) => onMenuKey(e, i)}
            >
              <strong>{f.label}</strong>
              <span className="download-hint">{f.hint}</span>
            </button>
          ))}
        </div>
      )}
      {failed && (
        <span role="alert" className="download-error">
          {de.downloadFailed}
        </span>
      )}
    </span>
  );
}
