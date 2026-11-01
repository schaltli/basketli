import { useState } from 'react';
import { clampParams, DEFAULTS, setWeaveMaterial, type BasketParams } from './geometry/params';
import { de } from './ui/i18n/de';
import { useBasketMesh } from './ui/viewer/useBasketMesh';
import { Viewer } from './ui/viewer/Viewer';
import './App.css';

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
              value={params.wallStyle === 'weave' ? 'weave' : 'solid'}
              onChange={(e) =>
                update({ ...params, wallStyle: e.target.value === 'weave' ? 'weave' : 'solid' })
              }
            >
              <option value="solid">{de.wallStyleSolid}</option>
              <option value="weave">{de.wallStyleWeave}</option>
            </select>
          </label>
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
