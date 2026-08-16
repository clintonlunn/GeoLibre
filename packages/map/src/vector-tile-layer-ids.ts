/**
 * A vector-tile source layer's name inside a MapLibre layer id. Percent-encoding keeps a name with
 * a separator in it from splitting the id; the `%` swap is inherited from `layer-sync` and its
 * reason is not recorded. Note the pair is not injective — `a/b` and `a_2Fb` both encode to
 * `a_2Fb` — which is a collision this preserves rather than introduces.
 */
export function encodeVectorTileLayerPart(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}
