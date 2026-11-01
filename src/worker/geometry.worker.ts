/// <reference lib="webworker" />
import wasmUrl from 'manifold-3d/manifold.wasm?url';
import { build } from '../geometry/build';
import { loadManifold } from '../geometry/manifold';
import type { BuildRequest, BuildResponse } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

// Only the newest request per quality matters; older queued ones are skipped.
const latest = new Map<string, number>();
let chain: Promise<void> = Promise.resolve();

self.onmessage = (e: MessageEvent<BuildRequest>) => {
  const req = e.data;
  latest.set(req.quality, req.id);
  chain = chain.then(() => handle(req));
};

async function handle(req: BuildRequest): Promise<void> {
  if (latest.get(req.quality) !== req.id) return;
  let res: BuildResponse;
  try {
    const wasm = await loadManifold(wasmUrl);
    const t0 = performance.now();
    const mesh = build(wasm, req.params, req.quality);
    res = { id: req.id, ok: true, mesh, ms: performance.now() - t0 };
    self.postMessage(res, [mesh.positions.buffer, mesh.indices.buffer]);
  } catch (err) {
    res = { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
    self.postMessage(res);
  }
}
