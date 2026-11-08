import { create } from 'zustand';

const COLLAPSED_KEY = 'basketli.collapsed';

/** Closed panel sections, remembered in this browser (if it lets us). */
function loadCollapsed(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COLLAPSED_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function saveCollapsed(collapsed: Record<string, boolean>) {
  try {
    localStorage.setItem(COLLAPSED_KEY, JSON.stringify(collapsed));
  } catch {
    // private mode or blocked storage: only this session remembers
  }
}

/**
 * UI state that is not part of the basket (and not in the link): the grid
 * mode (dividers) and the shape mode (irregular top), one at a time, and
 * which panel sections are closed.
 */
export const useUi = create<{
  gridMode: boolean;
  shapeMode: boolean;
  collapsed: Record<string, boolean>;
  setGridMode: (on: boolean) => void;
  setShapeMode: (on: boolean) => void;
  toggleSection: (id: string) => void;
}>((set) => ({
  gridMode: false,
  shapeMode: false,
  collapsed: loadCollapsed(),
  setGridMode: (on) => set(on ? { gridMode: true, shapeMode: false } : { gridMode: false }),
  setShapeMode: (on) => set(on ? { shapeMode: true, gridMode: false } : { shapeMode: false }),
  toggleSection: (id) =>
    set((s) => {
      const collapsed = { ...s.collapsed, [id]: !s.collapsed[id] };
      saveCollapsed(collapsed);
      return { collapsed };
    }),
}));
