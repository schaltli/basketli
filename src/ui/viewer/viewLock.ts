import { create } from 'zustand';

/**
 * While a dimension label is being edited the view holds still: the camera
 * does not re-fit and the labels do not move, so the slider stays under the
 * mouse. The camera fits once the editor closes.
 */
export const useViewLock = create<{ editing: boolean; setEditing: (on: boolean) => void }>(
  (set) => ({
    editing: false,
    setEditing: (on) => set({ editing: on }),
  }),
);
