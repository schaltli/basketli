import type { MeshData, Quality } from '../geometry/build';
import type { BasketParams } from '../geometry/params';

export interface BuildRequest {
  id: number;
  params: BasketParams;
  quality: Quality;
}

export type BuildResponse =
  { id: number; ok: true; mesh: MeshData; ms: number } | { id: number; ok: false; error: string };
