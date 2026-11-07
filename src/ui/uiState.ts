import { create } from 'zustand';

/**
 * UI state that is not part of the basket (and not in the link): the grid
 * mode (dividers) and the shape mode (irregular top), one at a time.
 */
export const useUi = create<{
  gridMode: boolean;
  shapeMode: boolean;
  setGridMode: (on: boolean) => void;
  setShapeMode: (on: boolean) => void;
}>((set) => ({
  gridMode: false,
  shapeMode: false,
  setGridMode: (on) => set(on ? { gridMode: true, shapeMode: false } : { gridMode: false }),
  setShapeMode: (on) => set(on ? { shapeMode: true, gridMode: false } : { shapeMode: false }),
}));
