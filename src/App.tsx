import { useState } from 'react';
import { DEFAULTS } from './geometry/params';
import { de } from './ui/i18n/de';
import { useBasketMesh } from './ui/viewer/useBasketMesh';
import { Viewer } from './ui/viewer/Viewer';
import './App.css';

export function App() {
  const [params] = useState(DEFAULTS);
  const state = useBasketMesh(params);

  return (
    <div className="app">
      <header className="app-header">
        <h1>{de.appTitle}</h1>
      </header>
      <main
        className="app-stage"
        data-testid="stage"
        data-status={state.status}
        data-triangles={state.mesh ? state.mesh.indices.length / 3 : 0}
      >
        <Viewer mesh={state.mesh} params={params} />
        {state.status === 'error' && (
          <p className="app-error" role="alert">
            {de.buildError}
          </p>
        )}
      </main>
    </div>
  );
}
