import { useEffect, useRef, useState } from 'react';
import type { MeshData } from '../../geometry/build';
import type { BasketParams } from '../../geometry/params';
import { GeometryClient, SupersededError } from '../../worker/client';

export const DEBOUNCE_MS = 150;

export type MeshState =
  | { status: 'loading'; mesh?: MeshData }
  | { status: 'ready'; mesh: MeshData; ms: number }
  | { status: 'error'; error: string; mesh?: MeshData };

let shared: GeometryClient | undefined;
/** One worker for the whole app (preview and export share the loaded WASM). */
export function geometryClient(): GeometryClient {
  shared ??= new GeometryClient();
  return shared;
}

/** Debounced preview build; keeps showing the previous mesh while rebuilding. */
export function useBasketMesh(params: BasketParams): MeshState {
  const [state, setState] = useState<MeshState>({ status: 'loading' });
  const first = useRef(true);

  useEffect(() => {
    let cancelled = false;
    const delay = first.current ? 0 : DEBOUNCE_MS;
    first.current = false;
    const timer = setTimeout(() => {
      setState((s) => ({ status: 'loading', mesh: s.mesh }));
      geometryClient()
        .build(params, 'preview')
        .then(
          (r) => !cancelled && setState({ status: 'ready', mesh: r.mesh, ms: r.ms }),
          (e: unknown) => {
            if (cancelled || e instanceof SupersededError) return;
            setState((s) => ({ status: 'error', error: String(e), mesh: s.mesh }));
          },
        );
    }, delay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [params]);

  return state;
}
