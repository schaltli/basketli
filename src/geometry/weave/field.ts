/**
 * Wall as a height field: for every column (arc position s) and height z the
 * inner and outer surface offset along the outward wall normal, measured
 * from the weave centerline.
 */
export interface Field {
  s: Float64Array;
  z: Float64Array;
  /** Row-major [column][height]. */
  inner: Float64Array;
  outer: Float64Array;
}
