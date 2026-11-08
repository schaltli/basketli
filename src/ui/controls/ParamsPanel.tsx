import { useEffect, useRef } from 'react';
import { dividerTop } from '../../geometry/dividers';
import {
  CORNER_KEYS,
  FLOOR_PATTERNS,
  HANDLE_TYPES,
  LABEL_TAPES,
  LIMITS,
  MIN_DIVIDER_HEIGHT,
  setWeaveMaterial,
  sidesOf,
  type BasketParams,
  type Sides,
} from '../../geometry/params';
import { useUi } from '../uiState';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { noticeText } from './notices';
import { NumberField } from './NumberField';
import { Section } from './Section';
import { SideChoice } from './SideChoice';
import { applyChoice, choiceOf, STYLE_CHOICES, type StyleChoice } from './styleChoice';

type NumericPath =
  | 'width'
  | 'depth'
  | 'height'
  | 'heightFL'
  | 'heightFR'
  | 'heightBL'
  | 'heightBR'
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
  | 'slotWidth'
  | 'slotHeight'
  | 'slotBar'
  | 'labelWidth'
  | 'labelHeight'
  | 'labelRadius'
  | `weave.${'materialHeight' | 'materialThickness' | 'stakeSpacing' | 'stakeDiameter' | 'rowGap' | 'rim'}`
  | `voronoi.${'cellSize'}`
  | `expanded.${'diamondWidth' | 'diamondHeight' | 'strand' | 'twist'}`
  | `braid.${'bandWidth' | 'bandThickness' | 'bandGap'}`;

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
  heightFL: 1,
  heightFR: 1,
  heightBL: 1,
  heightBR: 1,
  cornerRadius: 0.5,
  borderBand: 0.5,
  holeSize: 0.5,
  'weave.materialHeight': 0.5,
  'weave.stakeSpacing': 0.5,
  'weave.rim': 0.5,
  'expanded.diamondWidth': 0.5,
  'expanded.diamondHeight': 0.5,
  'voronoi.cellSize': 0.5,
  'braid.bandWidth': 0.5,
  'braid.bandGap': 0.5,
  handleWidth: 1,
  floorHoleSize: 0.5,
  floorWebWidth: 0.5,
  handleDepth: 1,
  slotWidth: 1,
  slotHeight: 1,
  slotBar: 1,
  labelWidth: 1,
  labelHeight: 0.5,
  labelRadius: 0.5,
};

const FLOOR_LABEL = {
  closed: de.floorClosed,
  hex: de.floorHex,
  voronoi: de.floorVoronoi,
  diamond: de.floorDiamond,
  slots: de.floorSlots,
} as const;

const HANDLE_TYPE_LABEL = { notch: de.handleTypeNotch, slot: de.handleTypeSlot } as const;

/** Chosen walls as text, e.g. "vorne, links". */
const sidesText = (s: Sides) =>
  sidesOf(s)
    .map((k) => de.side[k])
    .join(', ') || de.sidesNone;

const fmt = (v: number) => String(Math.round(v * 10) / 10);

/** One line about the basket's size for the closed size section. */
function sizeSummary(p: BasketParams): string {
  if (!p.irregular) return `${fmt(p.width)} × ${fmt(p.depth)} × ${fmt(p.height)}`;
  const hs = CORNER_KEYS.map((k) => p[k]);
  return `${fmt(p.width)} × ${fmt(p.depth)} × ${fmt(Math.min(...hs))}–${fmt(Math.max(...hs))}`;
}

const CHOICE_LABEL: Record<StyleChoice, string> = {
  expanded: de.wallStyleExpanded,
  hex: de.wallStyleHex,
  voronoi: de.wallStyleVoronoi,
  'weave-closed': de.wallStyleWeaveClosed,
  'weave-open': de.wallStyleWeaveOpen,
  braid: de.wallStyleBraid,
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
  braid: ['braid.bandWidth', 'braid.bandThickness', 'braid.bandGap', 'borderBand'],
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
  const setShapeMode = useUi((s) => s.setShapeMode);
  const panel = useRef<HTMLElement>(null);
  const choice = choiceOf(params);
  const hasHandles = sidesOf(params.handleSides).length > 0;
  const hasLabel = sidesOf(params.labelSides).length > 0;

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

      <Section id="size" title={de.groupSize} summary={sizeSummary(params)}>
        {(['width', 'depth'] as const).map(field)}
        {!params.irregular && field('height')}
        <label className="check">
          <input
            type="checkbox"
            checked={params.irregular}
            onChange={(e) => {
              const on = e.target.checked;
              update((p) =>
                on
                  ? // start level at the current height
                    {
                      ...p,
                      irregular: true,
                      heightFL: p.height,
                      heightFR: p.height,
                      heightBL: p.height,
                      heightBR: p.height,
                    }
                  : { ...p, irregular: false },
              );
              setShapeMode(on);
            }}
          />
          {de.irregular}
        </label>
        {params.irregular && (
          <>
            <p className="field-hint">{de.irregularHint}</p>
            {(['heightBL', 'heightBR', 'heightFL', 'heightFR'] as const).map(field)}
            <button type="button" className="secondary" onClick={() => setShapeMode(true)}>
              {de.shapeEdit}
            </button>
          </>
        )}
        {field('cornerRadius')}
      </Section>

      <Section id="wall" title={de.groupWall} summary={CHOICE_LABEL[choice]}>
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
      </Section>

      <Section id="handles" title={de.groupHandles} summary={sidesText(params.handleSides)}>
        <SideChoice
          label={de.handleSides}
          value={params.handleSides}
          onChange={(side, on) =>
            update((p) => ({ ...p, handleSides: { ...p.handleSides, [side]: on } }))
          }
          hint={de.sidesHint}
        />
        {hasHandles && (
          <div className="field">
            <label htmlFor="handle-type">{de.fields.handleType}</label>
            <select
              id="handle-type"
              value={params.handleType}
              onChange={(e) => {
                const next = HANDLE_TYPES.find((t) => t === e.target.value) ?? 'notch';
                update((p) => ({ ...p, handleType: next }));
              }}
            >
              {HANDLE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {HANDLE_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
            <p className="field-hint">
              {params.handleType === 'slot' ? de.slotHint : de.handlesHint}
            </p>
          </div>
        )}
        {hasHandles &&
          (params.handleType === 'slot'
            ? (['slotWidth', 'slotHeight', 'slotBar'] as const)
            : (['handleWidth', 'handleDepth'] as const)
          ).map(field)}
      </Section>

      <Section id="label" title={de.groupLabel} summary={sidesText(params.labelSides)}>
        <SideChoice
          label={de.labelSides}
          value={params.labelSides}
          onChange={(side, on) =>
            update((p) => ({ ...p, labelSides: { ...p.labelSides, [side]: on } }))
          }
          hint={de.sidesHint}
        />
        {hasLabel && (['labelWidth', 'labelHeight', 'labelRadius'] as const).map(field)}
        {hasLabel && (
          <div className="field">
            <label htmlFor="label-tape">{de.fields.labelTape}</label>
            <select
              id="label-tape"
              value={params.labelTape}
              onChange={(e) => {
                const next = LABEL_TAPES.find((t) => t === e.target.value) ?? 'none';
                update((p) => ({ ...p, labelTape: next }));
              }}
            >
              {LABEL_TAPES.map((t) => (
                <option key={t} value={t}>
                  {t === 'none' ? de.labelTapeNone : de.labelTapeWidth(t)}
                </option>
              ))}
            </select>
            <p className="field-hint">{de.labelTapeHint}</p>
          </div>
        )}
      </Section>

      <Section id="floor" title={de.groupFloor} summary={FLOOR_LABEL[params.floorPattern]}>
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
      </Section>

      <Section
        id="dividers"
        title={de.groupDividers}
        summary={de
          .dividerCount(params.dividersX.length, params.dividersY.length)
          .replace(/\.$/, '')}
      >
        <p className="field-hint">
          {de.dividerCount(params.dividersX.length, params.dividersY.length)}
        </p>
        <button type="button" className="secondary" onClick={() => setGridMode(true)}>
          {de.dividerEdit}
        </button>
        {params.wallStyle !== 'solid' && params.wallStyle !== 'braid' && (
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
      </Section>

      <Section
        id="stacking"
        title={de.groupStacking}
        summary={params.stackable ? de.stackOn : de.stackOff}
      >
        <label className="check">
          <input
            type="checkbox"
            checked={params.stackable}
            disabled={params.irregular}
            onChange={(e) => update((p) => ({ ...p, stackable: e.target.checked }))}
          />
          {de.fields.stackable}
        </label>
        {params.irregular && <p className="field-hint">{de.stackIrregular}</p>}
        {params.stackable && field('stackClearance')}
      </Section>

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
