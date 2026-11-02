import { create } from 'zustand';

/** UI state that is not part of the basket (and not in the link). */
export const useUi = create<{ gridMode: boolean; setGridMode: (on: boolean) => void }>((set) => ({
  gridMode: false,
  setGridMode: (on) => set({ gridMode: on }),
}));
