import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import type { Group } from 'three';
import { SIDES, type BasketParams, type Side } from '../../geometry/params';
import { de } from '../i18n/de';

/** Names of walls seen from behind are dimmed: they would read through the basket. */
const BEHIND_OPACITY = 0.25;

/**
 * The wall names (vorne, hinten, links, rechts) on the ground beside the
 * basket, outside the dimension lines, so the walls chosen in the panel can
 * be found on the model.
 */
export function SideLabels({ params }: { params: BasketParams }) {
  const { width: W, depth: D, height: H } = params;
  const group = useRef<Group>(null);
  const els = useRef<Partial<Record<Side, HTMLDivElement | null>>>({});
  const off = Math.max(6, Math.max(W, D, H) * 0.06) * 3;
  const at: Record<Side, [number, number, number]> = {
    front: [0, -D / 2 - off, 0],
    back: [0, D / 2 + off, 0],
    left: [-W / 2 - off, 0, 0],
    right: [W / 2 + off, 0, 0],
  };

  useFrame(({ camera }) => {
    const g = group.current;
    if (!g) return;
    const cam = g.worldToLocal(camera.position.clone());
    const facing: Record<Side, boolean> = {
      front: cam.y < -D / 2,
      back: cam.y > D / 2,
      left: cam.x < -W / 2,
      right: cam.x > W / 2,
    };
    for (const side of SIDES) {
      const el = els.current[side];
      // seen from straight above every name is in front
      const opacity = facing[side] || cam.z > 3 * Math.max(W, D) ? '1' : String(BEHIND_OPACITY);
      if (el && el.style.opacity !== opacity) el.style.opacity = opacity;
    }
  });

  return (
    <group ref={group}>
      {SIDES.map((side) => (
        <Html key={side} position={at[side]} center zIndexRange={[5, 0]}>
          <div
            ref={(el) => {
              els.current[side] = el;
            }}
            className="side-name"
            data-side={side}
          >
            {de.side[side]}
          </div>
        </Html>
      ))}
    </group>
  );
}
