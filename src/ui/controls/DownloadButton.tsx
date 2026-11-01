import { useState } from 'react';
import { exportFileName, saveFile } from '../../export/download';
import { toStl } from '../../export/stl';
import type { BasketParams } from '../../geometry/params';
import { de } from '../i18n/de';
import { geometryClient } from '../viewer/useBasketMesh';

/** Builds the basket in export quality and downloads it. */
export function DownloadButton({ params }: { params: BasketParams }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { mesh } = await geometryClient().build(params, 'export');
      saveFile(toStl(mesh), exportFileName(params, 'stl'), 'model/stl');
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="download">
      <button type="button" onClick={download} disabled={busy} aria-busy={busy}>
        {busy ? de.downloadBusy : de.downloadStl}
      </button>
      {failed && (
        <span role="alert" className="download-error">
          {de.downloadFailed}
        </span>
      )}
    </span>
  );
}
