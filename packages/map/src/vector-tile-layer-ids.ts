/**
 * A vector-tile source layer's name inside a MapLibre layer id. Percent-encoding keeps a name with
 * a separator in it from splitting the id, and `%` itself is swapped so the id stays readable.
 */
export function encodeVectorTileLayerPart(value: string): string {
  return encodeURIComponent(value).replaceAll("%", "_");
}
