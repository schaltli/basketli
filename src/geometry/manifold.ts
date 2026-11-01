import Module, { type ManifoldToplevel } from 'manifold-3d';

export type Wasm = ManifoldToplevel;

let instance: Promise<Wasm> | undefined;

/**
 * Loads the manifold WASM module once. In the browser pass the bundled
 * wasm URL; in Node the package locates the file itself.
 */
export function loadManifold(wasmUrl?: string): Promise<Wasm> {
  instance ??= Module(wasmUrl ? { locateFile: () => wasmUrl } : undefined).then((m) => {
    m.setup();
    return m;
  });
  return instance;
}

interface Deletable {
  delete(): void;
}

/** Collects WASM objects and frees them together (manifold objects are not garbage collected). */
export class Scope {
  private items: Deletable[] = [];

  keep<T extends Deletable>(item: T): T {
    this.items.push(item);
    return item;
  }

  dispose(): void {
    for (const item of this.items) item.delete();
    this.items = [];
  }
}
