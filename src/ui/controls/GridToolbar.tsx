import { wallIntrusion } from '../../geometry/stacking';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { useUi } from '../uiState';
import { evenPositions } from './gridMath';

/** Bar over the 3D view in grid mode: hint and whole-grid actions. */
export function GridToolbar() {
  const params = useBasket((s) => s.params);
  const update = useBasket((s) => s.update);
  const setGridMode = useUi((s) => s.setGridMode);
  const t = wallIntrusion(params);
  const any = params.dividersX.length + params.dividersY.length > 0;
  return (
    <div className="grid-toolbar" role="toolbar" aria-label={de.gridButton}>
      <p className="grid-hint">{de.gridHint}</p>
      <button
        type="button"
        className="secondary"
        disabled={!any}
        onClick={() =>
          update((p) => ({
            ...p,
            dividersX: evenPositions(p.dividersX.length, p.width, t),
            dividersY: evenPositions(p.dividersY.length, p.depth, t),
          }))
        }
      >
        {de.gridEven}
      </button>
      <button
        type="button"
        className="secondary"
        disabled={!any}
        onClick={() => update((p) => ({ ...p, dividersX: [], dividersY: [] }))}
      >
        {de.gridClear}
      </button>
      <button type="button" className="secondary" onClick={() => setGridMode(false)}>
        {de.gridDone}
      </button>
    </div>
  );
}
