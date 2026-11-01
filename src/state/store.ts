import { create } from 'zustand';
import { clampParams, DEFAULTS, type BasketParams, type Notice } from '../geometry/params';

interface BasketState {
  /** Always clamped. */
  params: BasketParams;
  /** Corrections from the last change (shown in the UI). */
  notices: Notice[];
  /** Applies a change; the result is clamped and the corrections recorded. */
  update: (change: (p: BasketParams) => BasketParams) => void;
  /** Replaces everything (e.g. from a shared link). */
  load: (params: BasketParams, notices?: Notice[]) => void;
}

export const useBasket = create<BasketState>((set, get) => ({
  params: DEFAULTS,
  notices: [],
  update: (change) => {
    const r = clampParams(change(structuredClone(get().params)));
    set({ params: r.params, notices: r.notices });
  },
  load: (params, notices = []) => {
    const r = clampParams(params);
    set({ params: r.params, notices: [...notices, ...r.notices] });
  },
}));
