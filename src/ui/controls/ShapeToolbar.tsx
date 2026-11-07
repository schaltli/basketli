import { CORNER_KEYS } from '../../geometry/params';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { useUi } from '../uiState';

/** Bar over the 3D view in shape mode: hint, level top, done. */
export function ShapeToolbar() {
  const update = useBasket((s) => s.update);
  const setShapeMode = useUi((s) => s.setShapeMode);
  return (
    <div className="grid-toolbar" role="toolbar" aria-label={de.shapeButton}>
      <p className="grid-hint">{de.shapeHint}</p>
      <button
        type="button"
        className="secondary"
        onClick={() =>
          update((p) => {
            const top = Math.max(...CORNER_KEYS.map((k) => p[k]));
            return { ...p, ...Object.fromEntries(CORNER_KEYS.map((k) => [k, top])) };
          })
        }
      >
        {de.shapeLevel}
      </button>
      <button type="button" className="secondary" onClick={() => setShapeMode(false)}>
        {de.shapeDone}
      </button>
    </div>
  );
}
