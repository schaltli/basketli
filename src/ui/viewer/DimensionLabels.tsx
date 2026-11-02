import { Html, Line } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef, useState } from 'react';
import { Vector3, type Group } from 'three';
import { LIMITS, type BasketParams } from '../../geometry/params';
import { useBasket } from '../../state/store';
import { de } from '../i18n/de';
import { DimensionLabel } from './DimensionLabel';
import { visibleLabels } from './labelLayout';

type Dim = 'width' | 'depth' | 'height';
type Vec3 = [number, number, number];

interface Edge {
  dim: Dim;
  from: Vec3;
  to: Vec3;
  tick: Vec3;
}

const LINE_COLOR = '#8b6d42';
const DIMS: Dim[] = ['width', 'depth', 'height'];

/**
 * Edges for width, depth and height on the outline sides that face the
 * camera (model coordinates, Z-up, mm), so the labels sit in front.
 */
function edges(p: BasketParams, sx: number, sy: number): Edge[] {
  const { width: w, depth: d, height: h } = p;
  const gap = Math.max(6, Math.max(w, d, h) * 0.06);
  const tick = gap / 3;
  const x = sx * (w / 2 + gap);
  const y = sy * (d / 2 + gap);
  const cx = sx * (w / 2 + gap * 0.7);
  const cy = sy * (d / 2 + gap * 0.7);
  return [
    { dim: 'width', from: [-w / 2, y, 0], to: [w / 2, y, 0], tick: [0, tick, 0] },
    { dim: 'depth', from: [x, -d / 2, 0], to: [x, d / 2, 0], tick: [tick, 0, 0] },
    {
      dim: 'height',
      from: [cx, cy, 0],
      to: [cx, cy, h],
      tick: [sx * tick * 0.7, sy * tick * 0.7, 0],
    },
  ];
}

const mid = (e: Edge): Vec3 => [
  (e.from[0] + e.to[0]) / 2,
  (e.from[1] + e.to[1]) / 2,
  (e.from[2] + e.to[2]) / 2,
];

/** One dimension: a thin line with end ticks and an editable label in its middle. */
function Dimension({ edge, visible }: { edge: Edge; visible: boolean }) {
  const { dim, from, to, tick } = edge;
  const value = useBasket((s) => s.params[dim]);
  const update = useBasket((s) => s.update);
  const end = (p: Vec3): [Vec3, Vec3] => [
    [p[0] - tick[0], p[1] - tick[1], p[2] - tick[2]],
    [p[0] + tick[0], p[1] + tick[1], p[2] + tick[2]],
  ];
  return (
    <group visible={visible}>
      <Line points={[from, to]} color={LINE_COLOR} lineWidth={1} />
      <Line points={end(from)} color={LINE_COLOR} lineWidth={1} />
      <Line points={end(to)} color={LINE_COLOR} lineWidth={1} />
      <Html
        position={mid(edge)}
        center
        zIndexRange={[20, 10]}
        style={{ display: visible ? '' : 'none' }}
      >
        <DimensionLabel
          label={de.fields[dim] ?? dim}
          value={value}
          min={LIMITS[dim].min}
          max={LIMITS[dim].max}
          step={1}
          onChange={(v) => update((p) => ({ ...p, [dim]: v }))}
        />
      </Html>
    </group>
  );
}

/**
 * Width, depth and height as editable labels on the model. They move to the
 * sides facing the camera, and a label hides while its edge is seen end-on or
 * would cover another label (the side panel always has every value).
 */
export function DimensionLabels({ params }: { params: BasketParams }) {
  const ref = useRef<Group>(null);
  const [view, setView] = useState({ sx: 1, sy: -1, show: [true, true, true] });
  const list = edges(params, view.sx, view.sy);

  useFrame(({ camera, size }) => {
    const g = ref.current;
    if (!g) return;
    // Camera position in model coordinates picks the facing sides.
    const cam = g.worldToLocal(camera.position.clone());
    const sx = cam.x >= 0 ? 1 : -1;
    const sy = cam.y >= 0 ? 1 : -1;
    const labels = edges(params, sx, sy).map((e) => {
      const m = g.localToWorld(new Vector3(...mid(e)));
      const a = g.localToWorld(new Vector3(...e.from));
      const b = g.localToWorld(new Vector3(...e.to));
      const ray = m.clone().sub(camera.position).normalize();
      const alignment = Math.abs(b.sub(a).normalize().dot(ray));
      const s = m.project(camera);
      return { x: ((s.x + 1) * size.width) / 2, y: ((1 - s.y) * size.height) / 2, alignment };
    });
    const show = visibleLabels(labels);
    if (sx !== view.sx || sy !== view.sy || show.some((v, i) => v !== view.show[i]))
      setView({ sx, sy, show });
  });

  return (
    <group ref={ref}>
      {list.map((e, i) => (
        <Dimension key={DIMS[i]} edge={e} visible={view.show[i] ?? true} />
      ))}
    </group>
  );
}
