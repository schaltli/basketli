import type { MeshData, Quality } from '../geometry/build';
import type { BasketParams } from '../geometry/params';
import type { BuildRequest, BuildResponse } from './protocol';

export interface BuildResult {
  mesh: MeshData;
  ms: number;
}

/** Thin promise wrapper around the geometry worker. Stale results are rejected. */
export class GeometryClient {
  private worker: Worker;
  private nextId = 1;
  private pending = new Map<
    number,
    { quality: Quality; resolve: (r: BuildResult) => void; reject: (e: Error) => void }
  >();

  constructor() {
    this.worker = new Worker(new URL('./geometry.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (e: MessageEvent<BuildResponse>) => {
      const res = e.data;
      const p = this.pending.get(res.id);
      if (!p) return;
      this.pending.delete(res.id);
      if (res.ok) p.resolve({ mesh: res.mesh, ms: res.ms });
      else p.reject(new Error(res.error));
    };
  }

  build(params: BasketParams, quality: Quality): Promise<BuildResult> {
    const id = this.nextId++;
    // The worker skips older requests of the same quality; reject them as superseded.
    for (const [otherId, p] of this.pending) {
      if (p.quality !== quality) continue;
      p.reject(new SupersededError());
      this.pending.delete(otherId);
    }
    const req: BuildRequest = { id, params, quality };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { quality, resolve, reject });
      this.worker.postMessage(req);
    });
  }

  dispose(): void {
    this.worker.terminate();
  }
}

export class SupersededError extends Error {
  constructor() {
    super('superseded');
  }
}
