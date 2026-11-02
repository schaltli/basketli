import { useEffect, useRef } from 'react';
import { dividerTop } from '../../geometry/dividers';
import {
  FLOOR_PATTERNS,
  HANDLE_MODES,
  LIMITS,
  MIN_DIVIDER_HEIGHT,
  setWeaveMaterial,
  type BasketParams,
} from '../../geometry/params';
import { useUi } from '../uiState';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { noticeText } from './notices';
import { NumberField } from './NumberField';
import { applyChoice, choiceOf, STYLE_CHOICES, type StyleChoice } from './styleChoice';

type NumericPath =
  | 'width'
  | 'depth'
  | 'height'
  | 'cornerRadius'
  | 'floor'
  | 'wall'
  | 'borderBand'
  | 'holeSize'
  | 'webWidth'
  | 'stackClearance'
  | 'handleWidth'
  | 'floorHoleSize'
  | 'floorWebWidth'
  | 'handleDepth'
  | `weave.${'materialHeight' | 'materialThickness' | 'stakeSpacing' | 'stakeDiameter' | 'rowGap' | 'rim'}`
  | `voronoi.${'cellSize'}`
  | `expanded.${'diamondWidth' | 'diamondHeight' | 'strand' | 'twist'}`;

function read(p: BasketParams, path: NumericPath): number {
  const [a, b] = path.split('.') as [string, string | undefined];
  const v = b
    ? (p as unknown as Record<string, Record<string, number>>)[a]![b]
    : (p as unknown as Record<string, number>)[a];
  return v!;
}

function write(p: BasketParams, path: NumericPath, value: number): BasketParams {
  const [a, b] = path.split('.') as [string, string | undefined];
  if (!b) return { ...p, [a]: value };
  const group = (p as unknown as Record<string, Record<string, number>>)[a]!;
  return { ...p, [a]: { ...group, [b]: value } };
}

const limitOf = (path: NumericPath) =>
  LIMITS[(path.includes('.') ? path.split('.')[1] : path) as keyof typeof LIMITS];

const STEP: Partial<Record<NumericPath, number>> = {
  width: 1,
  depth: 1,
  height: 1,
  cornerRadius: 0.5,
  borderBand: 0.5,
  holeSize: 0.5,
  'weave.materialHeight': 0.5,
  'weave.stakeSpacing': 0.5,
  'weave.rim': 0.5,
  'expanded.diamondWidth': 0.5,
  'expanded.diamondHeight': 0.5,
  'voronoi.cellSize': 0.5,
  handleWidth: 1,
  floorHoleSize: 0.5,
  floorWebWidth: 0.5,
  handleDepth: 1,
};

const FLOOR_LABEL = {
  closed: de.floorClosed,
  hex: de.floorHex,
  voronoi: de.floorVoronoi,
  diamond: de.floorDiamond,
  slots: de.floorSlots,
} as const;

const HANDLE_LABEL = { none: de.handlesNone, one: de.handlesOne, ends: de.handlesEnds } as const;

const CHOICE_LABEL: Record<StyleChoice, string> = {
  expanded: de.wallStyleExpanded,
  hex: de.wallStyleHex,
  voronoi: de.wallStyleVoronoi,
  'weave-closed': de.wallStyleWeaveClosed,
  'weave-open': de.wallStyleWeaveOpen,
  solid: de.wallStyleSolid,
};

/** Which parameters belong to which wall style. */
const STYLE_FIELDS: Record<StyleChoice, NumericPath[]> = {
  expanded: [
    'expanded.diamondWidth',
    'expanded.diamondHeight',
    'expanded.strand',
    'expanded.twist',
    'wall',
    'borderBand',
  ],
  hex: ['holeSize', 'webWidth', 'wall', 'borderBand'],
  voronoi: ['voronoi.cellSize', 'webWidth', 'wall', 'borderBand'],
  'weave-closed': [
    'weave.materialHeight',
    'weave.materialThickness',
    'weave.stakeSpacing',
    'weave.stakeDiameter',
    'weave.rim',
  ],
  'weave-open': [
    'weave.materialHeight',
    'weave.materialThickness',
    'weave.stakeSpacing',
    'weave.stakeDiameter',
    'weave.rowGap',
    'weave.rim',
  ],
  solid: ['wall'],
};

interface ParamsPanelProps {
  onClose: () => void;
}

/** Side panel with every parameter, grouped like Bento3D's parameter dialog. */
export function ParamsPanel({ onClose }: ParamsPanelProps) {
  const params = useBasket((s) => s.params);
  const notices = useBasket((s) => s.notices);
  const update = useBasket((s) => s.update);
  const setGridMode = useUi((s) => s.setGridMode);
  const panel = useRef<HTMLElement>(null);
  const choice = choiceOf(params);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input, select')?.focus();
  }, []);

  const field = (path: NumericPath) => {
    const lim = limitOf(path);
    return (
      <NumberField
        key={path}
        label={de.fields[path] ?? path}
        value={read(params, path)}
        min={lim.min}
        max={lim.max}
        step={STEP[path] ?? 0.1}
        onChange={(v) => update((p) => write(p, path, v))}
      />
    );
  };

  return (
    <aside
      ref={panel}
      className="params"
      aria-label={de.paramsTitle}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose();
      }}
    >
      <header className="params-header">
        <h2>{de.paramsTitle}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={de.close}>
          ×
        </button>
      </header>

      <fieldset>
        <legend>{de.groupSize}</legend>
        {(['width', 'depth', 'height', 'cornerRadius'] as const).map(field)}
      </fieldset>

      <fieldset>
        <legend>{de.groupWall}</legend>
        <div className="field">
          <label htmlFor="wall-style">{de.wallStyle}</label>
          <select
            id="wall-style"
            value={choice}
            onChange={(e) => {
              const next = STYLE_CHOICES.find((c) => c === e.target.value) ?? 'expanded';
              update((p) => applyChoice(p, next));
            }}
          >
            {STYLE_CHOICES.map((c) => (
              <option key={c} value={c}>
                {CHOICE_LABEL[c]}
              </option>
            ))}
          </select>
        </div>
        {params.wallStyle === 'weave' && (
          <div className="field">
            <label htmlFor="weave-material">{de.weaveMaterial}</label>
            <select
              id="weave-material"
              value={params.weave.material}
              onChange={(e) =>
                update((p) => setWeaveMaterial(p, e.target.value === 'band' ? 'band' : 'cane'))
              }
            >
              <option value="cane">{de.weaveCane}</option>
              <option value="band">{de.weaveBand}</option>
            </select>
          </div>
        )}
        {STYLE_FIELDS[choice].map(field)}
        {params.wallStyle === 'voronoi' && (
          <button
            type="button"
            className="secondary"
            onClick={() =>
              update((p) => ({
                ...p,
                voronoi: { ...p.voronoi, seed: (p.voronoi.seed % 9999) + 1 },
              }))
            }
          >
            {de.voronoiReroll}
          </button>
        )}
        <div className="field">
          <label htmlFor="handles">{de.fields.handles}</label>
          <select
            id="handles"
            value={params.handles}
            onChange={(e) => {
              const next = HANDLE_MODES.find((m) => m === e.target.value) ?? 'none';
              update((p) => ({ ...p, handles: next }));
            }}
          >
            {HANDLE_MODES.map((m) => (
              <option key={m} value={m}>
                {HANDLE_LABEL[m]}
              </option>
            ))}
          </select>
          <p className="field-hint">{de.handlesHint}</p>
        </div>
        {params.handles !== 'none' && (['handleWidth', 'handleDepth'] as const).map(field)}
      </fieldset>

      <fieldset>
        <legend>{de.groupFloor}</legend>
        {field('floor')}
        <div className="field">
          <label htmlFor="floor-pattern">{de.floorPattern}</label>
          <select
            id="floor-pattern"
            value={params.floorPattern}
            onChange={(e) => {
              const next = FLOOR_PATTERNS.find((f) => f === e.target.value) ?? 'closed';
              update((p) => ({ ...p, floorPattern: next }));
            }}
          >
            {FLOOR_PATTERNS.map((f) => (
              <option key={f} value={f}>
                {FLOOR_LABEL[f]}
              </option>
            ))}
          </select>
          <p className="field-hint">
            {params.floorPattern === 'slots' ? de.floorSlotsHint : de.floorHint}
          </p>
        </div>
        {params.floorPattern !== 'closed' &&
          (['floorHoleSize', 'floorWebWidth'] as const).map(field)}
      </fieldset>

      <fieldset>
        <legend>{de.groupDividers}</legend>
        <p className="field-hint">
          {de.dividerCount(params.dividersX.length, params.dividersY.length)}
        </p>
        <button type="button" className="secondary" onClick={() => setGridMode(true)}>
          {de.dividerEdit}
        </button>
        {params.wallStyle !== 'solid' && (
          <div className="field divider-style">
            <label htmlFor="divider-style">{de.dividerStyle}</label>
            <select
              id="divider-style"
              value={params.dividerStyle}
              onChange={(e) =>
                update((p) => ({
                  ...p,
                  dividerStyle: e.target.value === 'pattern' ? 'pattern' : 'plain',
                }))
              }
            >
              <option value="pattern">
                {params.wallStyle === 'weave' ? de.dividerWoven : de.dividerPattern}
              </option>
              <option value="plain">{de.dividerPlain}</option>
            </select>
          </div>
        )}
        <label className="check divider-max">
          <input
            type="checkbox"
            checked={params.dividerHeight === 0}
            onChange={(e) =>
              update((p) => ({
                ...p,
                dividerHeight: e.target.checked ? 0 : Math.round(dividerTop(p) * 10) / 10,
              }))
            }
          />
          {de.dividerMaxHeight}
        </label>
        {params.dividerHeight > 0 && (
          <NumberField
            label={de.fields.dividerHeight ?? 'Höhe'}
            value={params.dividerHeight}
            min={params.floor + MIN_DIVIDER_HEIGHT}
            max={Math.round(dividerTop(params) * 10) / 10}
            step={1}
            onChange={(v) => update((p) => ({ ...p, dividerHeight: v }))}
          />
        )}
      </fieldset>

      <fieldset>
        <legend>{de.groupStacking}</legend>
        <label className="check">
          <input
            type="checkbox"
            checked={params.stackable}
            onChange={(e) => update((p) => ({ ...p, stackable: e.target.checked }))}
          />
          {de.fields.stackable}
        </label>
        {params.stackable && field('stackClearance')}
      </fieldset>

      {notices.length > 0 && (
        <section className="notices" aria-live="polite">
          <h3>{de.groupNotices}</h3>
          <ul>
            {notices.map((n, i) => (
              <li key={i}>{noticeText(n)}</li>
            ))}
          </ul>
        </section>
      )}
    </aside>
  );
}
