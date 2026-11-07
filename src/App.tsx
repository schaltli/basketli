import { useState } from 'react';
import { useBasket } from './state/store';
import { ParamsPanel } from './ui/controls/ParamsPanel';
import { GridToolbar } from './ui/controls/GridToolbar';
import { ShapeToolbar } from './ui/controls/ShapeToolbar';
import { Toolbar } from './ui/controls/Toolbar';
import { useUi } from './ui/uiState';
import { de } from './ui/i18n/de';
import { useBasketMesh } from './ui/viewer/useBasketMesh';
import { Viewer } from './ui/viewer/Viewer';
import './App.css';

export function App() {
  const params = useBasket((s) => s.params);
  const state = useBasketMesh(params);
  const [paramsOpen, setParamsOpen] = useState(true);
  const gridMode = useUi((s) => s.gridMode);
  const shapeMode = useUi((s) => s.shapeMode) && params.irregular;

  return (
    <div className="app">
      <Toolbar paramsOpen={paramsOpen} onToggleParams={() => setParamsOpen((o) => !o)} />
      <div className="app-body">
        <main
          className="app-stage"
          data-testid="stage"
          data-status={state.status}
          data-triangles={state.mesh ? state.mesh.indices.length / 3 : 0}
        >
          <Viewer mesh={state.mesh} params={params} />
          {gridMode && <GridToolbar />}
          {shapeMode && <ShapeToolbar />}
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
        {paramsOpen && <ParamsPanel onClose={() => setParamsOpen(false)} />}
      </div>
    </div>
  );
}
