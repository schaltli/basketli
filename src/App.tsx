import { useState } from 'react';
import {
  clampParams,
  DEFAULTS,
  setWeaveMaterial,
  type BasketParams,
  type WallStyle,
} from './geometry/params';
import { DownloadButton } from './ui/controls/DownloadButton';
import { de } from './ui/i18n/de';
import { useBasketMesh } from './ui/viewer/useBasketMesh';
import { Viewer } from './ui/viewer/Viewer';
import './App.css';

/** Wall styles offered by the provisional controls (until T15). */
const TEMP_STYLES: WallStyle[] = ['solid', 'voronoi', 'weave'];

export function App() {
  const [params, setParams] = useState(DEFAULTS);
  const state = useBasketMesh(params);
  const update = (next: BasketParams) => setParams(clampParams(next).params);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{de.appTitle}</h1>
        {/* Provisional controls (T8); replaced by the parameter dialog in T15. */}
        <div className="app-temp-controls">
          <label>
            {de.wallStyle}{' '}
            <select
              value={TEMP_STYLES.includes(params.wallStyle) ? params.wallStyle : 'solid'}
              onChange={(e) => {
                const style = TEMP_STYLES.find((s) => s === e.target.value) ?? 'solid';
                update({ ...params, wallStyle: style });
              }}
            >
              <option value="solid">{de.wallStyleSolid}</option>
              <option value="voronoi">{de.wallStyleVoronoi}</option>
              <option value="weave">{de.wallStyleWeave}</option>
            </select>
          </label>
          {params.wallStyle === 'voronoi' && (
            <button
              type="button"
              onClick={() =>
                update({
                  ...params,
                  voronoi: { ...params.voronoi, seed: (params.voronoi.seed % 9999) + 1 },
                })
              }
            >
              {de.voronoiReroll}
            </button>
          )}
          {params.wallStyle === 'weave' && (
            <>
              <label>
                {de.weaveMaterial}{' '}
                <select
                  value={params.weave.material}
                  onChange={(e) =>
                    update(setWeaveMaterial(params, e.target.value === 'band' ? 'band' : 'cane'))
                  }
                >
                  <option value="cane">{de.weaveCane}</option>
                  <option value="band">{de.weaveBand}</option>
                </select>
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={params.weave.rowGap > 0}
                  onChange={(e) =>
                    update({
                      ...params,
                      weave: { ...params.weave, rowGap: e.target.checked ? 4 : 0 },
                    })
                  }
                />{' '}
                {de.weaveOpen}
              </label>
            </>
          )}
        </div>
        <DownloadButton params={params} />
      </header>
      <main
        className="app-stage"
        data-testid="stage"
        data-status={state.status}
        data-triangles={state.mesh ? state.mesh.indices.length / 3 : 0}
      >
        <Viewer mesh={state.mesh} params={params} />
        {state.status === 'ready' && (
          <p className="app-stats">
            {Math.round(state.ms)} ms · {(state.mesh.indices.length / 3).toLocaleString('de-CH')}{' '}
            {de.triangles}
          </p>
        )}
        {state.status === 'error' && (
          <p className="app-error" role="alert">
            {de.buildError}
          </p>
        )}
      </main>
    </div>
  );
}
