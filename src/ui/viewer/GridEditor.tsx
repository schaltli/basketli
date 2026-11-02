import { Html, Line } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useRef, useState } from 'react';
import { Plane, Raycaster, Vector2, Vector3 } from 'three';
import type { BasketParams } from '../../geometry/params';
import { wallIntrusion } from '../../geometry/stacking';
import { useBasket } from '../../state/store';
import { addDivider, compartments, dragLimits } from '../controls/gridMath';
import { de } from '../i18n/de';
import { useViewLock } from './viewLock';

type Axis = 'x' | 'y';
const KEY = { x: 'dividersX', y: 'dividersY' } as const;
const LINE_COLOR = '#8b6d42';
/** A press that moves less than this (px) is a click, not a drag. */
const CLICK_PX = 4;

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

/** Converts a pointer position to model coordinates on the plane at height z (model is Z-up). */
function useModelPoint(z: number) {
  const { camera, gl } = useThree();
  return (clientX: number, clientY: number): [number, number] | undefined => {
    const rect = gl.domElement.getBoundingClientRect();
    const ndc = new Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new Raycaster();
    ray.setFromCamera(ndc, camera);
    // model (x, y, z) is world (x, z, −y)
    const hit = ray.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), -z), new Vector3());
    return hit ? [hit.x, -hit.z] : undefined;
  };
}

interface HandleProps {
  axis: Axis;
  index: number;
  params: BasketParams;
  z: number;
  /** Where the handle sits (model coordinates), outside the basket. */
  at: [number, number];
}

/** Grip of one divider: drag to move, click to type a position or remove it. */
function DividerHandle({ axis, index, params, z, at }: HandleProps) {
  const update = useBasket((s) => s.update);
  const setEditing = useViewLock((s) => s.setEditing);
  const toModel = useModelPoint(z);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const key = KEY[axis];
  const size = axis === 'x' ? params.width : params.depth;
  const t = wallIntrusion(params);
  const value = params[key][index]!;

  const move = (pos: number) =>
    update((p) => {
      const list = [...p[key]];
      const [lo, hi] = dragLimits(list, index, size, t);
      list[index] = Math.round(Math.min(hi, Math.max(lo, pos)) * 10) / 10;
      return { ...p, [key]: list };
    });
  const remove = () => {
    update((p) => ({ ...p, [key]: p[key].filter((_, i) => i !== index) }));
    setOpen(false);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    let dragging = false;
    const onMove = (ev: PointerEvent) => {
      if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < CLICK_PX) return;
      if (!dragging) {
        dragging = true;
        setEditing(true);
      }
      const hit = toModel(ev.clientX, ev.clientY);
      if (!hit) return;
      const mm = axis === 'x' ? hit[0] + params.width / 2 : hit[1] + params.depth / 2;
      move(Math.round(mm));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragging) setEditing(false);
      else {
        setDraft(String(value));
        setOpen(true);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const label = axis === 'x' ? de.dividerFromLeft : de.dividerFromFront;
  return (
    <Html position={[at[0], at[1], z]} center zIndexRange={[30, 20]}>
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
          <label className="dim-editor-label" htmlFor={`div-${axis}-${index}`}>
            {label}
          </label>
          <div className="dim-editor-row">
            <input
              id={`div-${axis}-${index}`}
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
                  if (draft.trim() !== '' && Number.isFinite(n)) move(n);
                  setOpen(false);
                }
              }}
            />
            <span className="field-unit">mm</span>
          </div>
          <button type="button" className="secondary grid-remove" onClick={remove}>
            {de.dividerRemove}
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`grid-handle grid-handle-${axis}`}
          aria-label={`${axis === 'x' ? de.dividerX : de.dividerY} ${index + 1}: ${fmt(value)} mm`}
          onPointerDown={onPointerDown}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(String(value));
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
 * Grid mode on the model (seen from above): dividers highlighted, a grip
 * for each beside the basket, the clear size of every compartment, and "+"
 * buttons that add a divider in the middle of the widest compartment.
 */
export function GridEditor({ params }: { params: BasketParams }) {
  const update = useBasket((s) => s.update);
  const setEditing = useViewLock((s) => s.setEditing);
  const { width: W, depth: D, height: H } = params;
  const t = wallIntrusion(params);
  const z = H + 0.5;
  const gap = Math.max(8, Math.max(W, D) * 0.07);
  const xs = compartments(params.dividersX, W, t);
  const ys = compartments(params.dividersY, D, t);

  // leaving grid mode never leaves the view locked
  const lockRef = useRef(setEditing);
  useEffect(() => () => lockRef.current(false), []);

  const add = (axis: Axis) =>
    update((p) => {
      const key = KEY[axis];
      return { ...p, [key]: addDivider(p[key], axis === 'x' ? p.width : p.depth, t) };
    });

  return (
    <group>
      {params.dividersX.map((x, i) => (
        <group key={`x${i}`}>
          <Line
            points={[
              [-W / 2 + x, -D / 2 - gap * 0.6, z],
              [-W / 2 + x, D / 2, z],
            ]}
            color={LINE_COLOR}
            lineWidth={2}
          />
          <DividerHandle axis="x" index={i} params={params} z={z} at={[-W / 2 + x, -D / 2 - gap]} />
        </group>
      ))}
      {params.dividersY.map((y, i) => (
        <group key={`y${i}`}>
          <Line
            points={[
              [-W / 2, -D / 2 + y, z],
              [W / 2 + gap * 0.6, -D / 2 + y, z],
            ]}
            color={LINE_COLOR}
            lineWidth={2}
          />
          <DividerHandle axis="y" index={i} params={params} z={z} at={[W / 2 + gap, -D / 2 + y]} />
        </group>
      ))}
      {xs.flatMap((cx, i) =>
        ys.map((cy, j) => (
          <Html
            key={`c${i}-${j}`}
            position={[-W / 2 + cx.center, -D / 2 + cy.center, z]}
            center
            zIndexRange={[15, 10]}
          >
            <span className="grid-cell">
              {fmt(cx.width)} × {fmt(cy.width)}
            </span>
          </Html>
        )),
      )}
      {/* at the end of each grip row: x grips run below the basket, y grips to its right */}
      <Html position={[W / 2 + 1.6 * gap, -D / 2 - gap, z]} center zIndexRange={[30, 20]}>
        <button
          type="button"
          className="grid-add"
          aria-label={de.gridAddXLabel}
          onClick={() => add('x')}
        >
          {de.gridAddX}
        </button>
      </Html>
      <Html position={[W / 2 + gap, D / 2 + 1.3 * gap, z]} center zIndexRange={[30, 20]}>
        <button
          type="button"
          className="grid-add"
          aria-label={de.gridAddYLabel}
          onClick={() => add('y')}
        >
          {de.gridAddY}
        </button>
      </Html>
    </group>
  );
}
