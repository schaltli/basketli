import { useState } from 'react';
import { clampParams, DEFAULTS, setWeaveMaterial, type BasketParams } from './geometry/params';
import { DownloadButton } from './ui/controls/DownloadButton';
import { de } from './ui/i18n/de';
import { useBasketMesh } from './ui/viewer/useBasketMesh';
import { Viewer } from './ui/viewer/Viewer';
import './App.css';

/** Wall styles offered by the provisional controls (until T15). */
type StyleChoice = 'expanded' | 'hex' | 'voronoi' | 'weave-closed' | 'weave-open';
const STYLE_CHOICES: StyleChoice[] = ['expanded', 'hex', 'voronoi', 'weave-closed', 'weave-open'];
const OPEN_WEAVE_GAP = 4;

function choiceOf(p: BasketParams): StyleChoice {
  if (p.wallStyle === 'weave') return p.weave.rowGap > 0 ? 'weave-open' : 'weave-closed';
  return p.wallStyle === 'hex' || p.wallStyle === 'voronoi' ? p.wallStyle : 'expanded';
}

function applyChoice(p: BasketParams, choice: StyleChoice): BasketParams {
  if (choice === 'weave-closed' || choice === 'weave-open') {
    const rowGap = choice === 'weave-open' ? OPEN_WEAVE_GAP : 0;
    return { ...p, wallStyle: 'weave', weave: { ...p.weave, rowGap } };
  }
  return { ...p, wallStyle: choice };
}

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
              value={choiceOf(params)}
              onChange={(e) => {
                const choice = STYLE_CHOICES.find((c) => c === e.target.value) ?? 'expanded';
                update(applyChoice(params, choice));
              }}
            >
              <option value="expanded">{de.wallStyleExpanded}</option>
              <option value="hex">{de.wallStyleHex}</option>
              <option value="voronoi">{de.wallStyleVoronoi}</option>
              <option value="weave-closed">{de.wallStyleWeaveClosed}</option>
              <option value="weave-open">{de.wallStyleWeaveOpen}</option>
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
