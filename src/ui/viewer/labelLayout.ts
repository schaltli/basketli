/** A label on screen: its center (px) and how far its edge points at the viewer. */
export interface ScreenLabel {
  x: number;
  y: number;
  /** |cos| of the angle between the edge and the view ray: 1 = seen end-on. */
  alignment: number;
}

/** Labels closer than this (px, per axis) would overlap. */
export const LABEL_BOX = { width: 96, height: 32 } as const;
/** Edges seen nearly end-on cannot be read: their label hides. */
export const MAX_ALIGNMENT = 0.94;

/**
 * Which labels to show. Edges seen end-on hide; of two overlapping labels the
 * one whose edge points more towards the viewer hides (it is the least
 * readable), so the visible labels never cover each other.
 */
export function visibleLabels(labels: ScreenLabel[]): boolean[] {
  const show = labels.map((l) => l.alignment <= MAX_ALIGNMENT);
  const order = labels.map((_, i) => i).sort((a, b) => labels[a]!.alignment - labels[b]!.alignment);
  for (let k = 0; k < order.length; k++) {
    const i = order[k]!;
    if (!show[i]) continue;
    for (let m = 0; m < k; m++) {
      const j = order[m]!;
      if (!show[j]) continue;
      const a = labels[i]!;
      const b = labels[j]!;
      if (Math.abs(a.x - b.x) < LABEL_BOX.width && Math.abs(a.y - b.y) < LABEL_BOX.height) {
        show[i] = false;
        break;
      }
    }
  }
  return show;
}
