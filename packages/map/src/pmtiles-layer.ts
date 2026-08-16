/**
 * How a `pmtiles` store layer is shaped, kept apart from `layer-sync` so the plugins package can
 * import it (`@geolibre/map/pmtiles-layer`) without pulling in MapLibre and its stylesheet.
 */
import { DEFAULT_LAYER_STYLE, type GeoLibreLayer, type LayerStyle } from "@geolibre/core";
import { encodeVectorTileLayerPart } from "./vector-tile-layer-ids";

export const PMTILES_PROTOCOL = "pmtiles";

export function normalizePMTilesUrl(url: string): string {
  return url.startsWith(`${PMTILES_PROTOCOL}://`) ? url : `${PMTILES_PROTOCOL}://${url}`;
}

export function pmtilesVectorLayerId(sourceId: string, sourceLayer: string, kind: string): string {
  return `${sourceId}-${encodeVectorTileLayerPart(sourceLayer)}-${kind}`;
}

/**
 * The MapLibre layer ids `syncLayers` creates for a `pmtiles` store layer, in
 * the exact naming scheme `ensurePMTilesExternalLayer` uses. A layer built
 * outside the PMTiles control (e.g. the offline basemap extract dialog) must
 * put these in `metadata.nativeLayerIds` — a non-empty list is what marks the
 * layer renderable rather than a placeholder.
 */
export function pmtilesNativeLayerIds(
  sourceId: string,
  tileType: "vector" | "raster",
  sourceLayers: readonly string[],
): string[] {
  if (tileType === "raster") {
    return [`${sourceId}-raster`];
  }
  return sourceLayers.flatMap((sourceLayer) =>
    ["fill", "line", "circle"].map((kind) => pmtilesVectorLayerId(sourceId, sourceLayer, kind)),
  );
}

/** Everything {@link createPMTilesStoreLayer} needs beyond the archive's own facts. */
export interface PMTilesStoreLayerOptions {
  id: string;
  name: string;
  /** The archive, with or without the `pmtiles://` prefix. */
  url: string;
  tileType: "vector" | "raster";
  sourceLayers: readonly string[];
  visible?: boolean;
  opacity?: number;
  /** Merged over the defaults, for callers that paint their PMTiles layers their own way. */
  style?: Partial<LayerStyle>;
  pickable?: boolean;
  sourceLayerColors?: Record<string, string>;
  /** The MapLibre ids a control created itself; derived from the naming scheme otherwise. */
  nativeLayerIds?: readonly string[];
}

/**
 * The one place a `pmtiles` store layer is shaped. `syncLayers` only renders an archive when the
 * layer carries `sourceKind`, `externalNativeLayer`, and a non-empty `nativeLayerIds` — miss one
 * and the layer is added but drawn as a placeholder, with nothing to say why. Callers differ in
 * name, paint, and whether they made the native layers themselves; the contract does not, so it
 * lives here rather than at each of them.
 */
export function createPMTilesStoreLayer(options: PMTilesStoreLayerOptions): GeoLibreLayer {
  const { id, name, tileType } = options;
  const sourceLayers = [...options.sourceLayers];
  const url = normalizePMTilesUrl(options.url);
  const fillColor =
    (sourceLayers[0] ? options.sourceLayerColors?.[sourceLayers[0]] : undefined) ??
    DEFAULT_LAYER_STYLE.fillColor;

  return {
    id,
    name,
    type: "pmtiles",
    source: {
      sourceId: id,
      sourceLayers,
      tileType,
      type: tileType === "raster" ? "raster" : "vector",
      url,
    },
    sourcePath: url,
    visible: options.visible ?? true,
    opacity: options.opacity ?? 1,
    style: { ...DEFAULT_LAYER_STYLE, fillColor, strokeColor: fillColor, ...options.style },
    metadata: {
      externalNativeLayer: true,
      nativeLayerIds: [
        ...(options.nativeLayerIds ?? pmtilesNativeLayerIds(id, tileType, sourceLayers)),
      ],
      pickable: options.pickable ?? true,
      sourceId: id,
      sourceKind: "pmtiles-url",
      ...(options.sourceLayerColors ? { sourceLayerColors: options.sourceLayerColors } : {}),
      sourceLayers,
      tileType,
    },
  };
}
