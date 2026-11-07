import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import { LIMITS, topAt, type BasketParams, type CornerKey } from '../../geometry/params';
import { RoundedRectPath } from '../../geometry/weave/outline';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { useViewLock } from './viewLock';

const LINE_COLOR = '#8b6d42';
/** A press that moves less than this (px) is a click, not a drag. */
const CLICK_PX = 4;

type Corners = Record<CornerKey, number>;

/** Corner keys and where they sit (−1/+1 = left/right, front/back). */
const CORNERS: { key: CornerKey; sx: number; sy: number }[] = [
  { key: 'heightFL', sx: -1, sy: -1 },
  { key: 'heightFR', sx: 1, sy: -1 },
  { key: 'heightBL', sx: -1, sy: 1 },
  { key: 'heightBR', sx: 1, sy: 1 },
];

/** Top edges of the four walls: their two corners and the outward side. */
const EDGES: {
  name: keyof typeof de.shapeEdge;
  keys: [CornerKey, CornerKey];
  sx: number;
  sy: number;
}[] = [
  { name: 'front', keys: ['heightFL', 'heightFR'], sx: 0, sy: -1 },
  { name: 'back', keys: ['heightBL', 'heightBR'], sx: 0, sy: 1 },
  { name: 'left', keys: ['heightFL', 'heightBL'], sx: -1, sy: 0 },
  { name: 'right', keys: ['heightFR', 'heightBR'], sx: 1, sy: 0 },
];

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
const clampHeight = (v: number) =>
  Math.min(LIMITS.heightFL.max, Math.max(LIMITS.heightFL.min, Math.round(v * 10) / 10));
const cornersOf = (p: BasketParams): Corners => ({
  heightFL: p.heightFL,
  heightFR: p.heightFR,
  heightBL: p.heightBL,
  heightBR: p.heightBR,
});

/**
 * Height under the pointer on the vertical plane through a model point that
 * faces the camera (model is Z-up; model (x, y, z) is world (x, z, −y)).
 */
function useHeightAt() {
  const { camera, gl } = useThree();
  return (clientX: number, clientY: number, x: number, y: number): number | undefined => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, camera);
    const normal = camera.getWorldDirection(new Vector3()).setY(0);
    if (normal.lengthSq() < 1e-6) normal.set(0, 0, 1);
    const plane = new Plane().setFromNormalAndCoplanarPoint(
      normal.normalize(),
      new Vector3(x, 0, -y),
    );
    const hit = ray.ray.intersectPlane(plane, new Vector3());
    return hit ? hit.y : undefined;
  };
}

interface GripProps {
  /** Grip position (model coordinates, mm). */
  at: [number, number, number];
  label: string;
  value: number;
  /** Starts a drag; returns the new corner heights for a height change dz (mm). */
  onDrag: (dz: number, shift: boolean) => Corners;
  onDraft: (c: Corners | null) => void;
  onSet: (value: number) => void;
  className: string;
}

/** A grip on the model: drag up or down, click to type a height. */
function Grip({ at, label, value, onDrag, onDraft, onSet, className }: GripProps) {
  const update = useBasket((s) => s.update);
  const setEditing = useViewLock((s) => s.setEditing);
  const heightAt = useHeightAt();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const z0 = heightAt(e.clientX, e.clientY, at[0], at[1]);
    let dragging = false;
    let last: Corners | null = null;
    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < CLICK_PX) return;
      if (!dragging) {
        dragging = true;
        setEditing(true);
      }
      const z = heightAt(ev.clientX, ev.clientY, at[0], at[1]);
      if (z === undefined || z0 === undefined) return;
      last = onDrag(Math.round(z - z0), ev.shiftKey);
      onDraft(last);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) {
        setEditing(false);
        const next = last;
        onDraft(null);
        if (next) update((p) => ({ ...p, ...next }));
      } else {
        setDraft(fmt(value));
        setOpen(true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <Html position={at} center zIndexRange={[30, 20]}>
      {open ? (
        <div
          className="dim-editor grid-editor-pop"
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setOpen(false);
            }
          }}
        >
          <label className="dim-editor-label" htmlFor={`shape-${className}-${label}`}>
            {label}
          </label>
          <div className="dim-editor-row">
            <input
              id={`shape-${className}-${label}`}
              className="field-number"
              type="text"
              inputMode="decimal"
              autoFocus
              onFocus={(e) => e.target.select()}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const n = Number(draft.replace(',', '.'));
                  if (draft.trim() !== '' && Number.isFinite(n)) onSet(clampHeight(n));
                  setOpen(false);
                }
              }}
              onBlur={() => setOpen(false)}
            />
            <span className="field-unit">mm</span>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className={`grid-handle shape-handle ${className}`}
          aria-label={`${label}: ${fmt(value)} mm`}
          title={label}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(fmt(value));
              setOpen(true);
            }
          }}
        >
          {fmt(value)}
        </button>
      )}
    </Html>
  );
}

/**
 * Shape mode: grips for the height of every corner and of every wall's top
 * edge (both its corners together; with Shift it tilts about its middle).
 * While dragging only a line shows the new top; the basket is rebuilt when
 * the grip is let go.
 */
export function ShapeEditor({ params }: { params: BasketParams }) {
  const update = useBasket((s) => s.update);
  const setEditing = useViewLock((s) => s.setEditing);
  const [draft, setDraft] = useState<Corners | null>(null);
  const corners = draft ?? cornersOf(params);
  const shown: BasketParams = { ...params, ...corners };
  const { width: W, depth: D } = params;
  const gap = Math.max(6, Math.max(W, D) * 0.05);

  // leaving shape mode never leaves the view locked
  const lockRef = useRef(setEditing);
  useEffect(() => () => lockRef.current(false), []);

  // the new top edge along the outer outline, and a post at every corner
  const path = new RoundedRectPath(W, D, params.cornerRadius);
  const ring = [...path.breakpoints(3), path.length].map((s) => {
    const q = path.at(s).p;
    return [q[0], q[1], topAt(shown, q[0], q[1]) + 0.3] as [number, number, number];
  });

  const set = (keys: CornerKey[], value: number) =>
    update((p) => ({ ...p, ...Object.fromEntries(keys.map((k) => [k, value])) }));

  return (
    <group>
      <Line points={ring} color={LINE_COLOR} lineWidth={draft ? 3 : 2} />
      {CORNERS.map(({ key, sx, sy }) => {
        const x = (sx * W) / 2;
        const y = (sy * D) / 2;
        const z = corners[key];
        return (
          <group key={key}>
            <Line
              points={[
                [x, y, 0],
                [x, y, z],
              ]}
              color={LINE_COLOR}
              lineWidth={1}
              dashed
              dashSize={3}
              gapSize={2}
            />
            <Grip
              at={[x + sx * gap * 0.35, y + sy * gap * 0.35, z]}
              label={de.shapeCorner[key]}
              value={z}
              className="shape-corner"
              onDraft={setDraft}
              onDrag={(dz) => ({ ...cornersOf(params), [key]: clampHeight(params[key] + dz) })}
              onSet={(v) => set([key], v)}
            />
          </group>
        );
      })}
      {EDGES.map(({ name, keys: [a, b], sx, sy }) => {
        const x = sx === 0 ? 0 : (sx * W) / 2 + sx * gap * 0.5;
        const y = sy === 0 ? 0 : (sy * D) / 2 + sy * gap * 0.5;
        const z = (corners[a] + corners[b]) / 2;
        return (
          <Grip
            key={name}
            at={[x, y, z]}
            label={de.shapeEdge[name]}
            value={Math.round(z * 10) / 10}
            className="shape-edge"
            onDraft={setDraft}
            onDrag={(dz, tilt) => ({
              ...cornersOf(params),
              [a]: clampHeight(params[a] + dz),
              [b]: clampHeight(params[b] + (tilt ? -dz : dz)),
            })}
            onSet={(v) => {
              // keep the edge's tilt, move its middle to v
              const shift = v - (params[a] + params[b]) / 2;
              update((p) => ({
                ...p,
                [a]: clampHeight(p[a] + shift),
                [b]: clampHeight(p[b] + shift),
              }));
            }}
          />
        );
      })}
    </group>
  );
}
