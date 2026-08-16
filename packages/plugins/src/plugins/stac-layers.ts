import { useAppStore } from "@geolibre/core";
import { createPMTilesStoreLayer, readRemotePMTilesInfo } from "@geolibre/map/pmtiles-layer";
import { createLayerId } from "../layer-ids";

/**
 * Add a STAC item's PMTiles asset as a layer.
 *
 * Not through the PMTiles control: it is a singleton that holds the archive it is loading on
 * itself and reports the outcome through shared state, so a caller cannot tell which add failed or
 * which layer it produced. Reading the header here is a range request, and the layer shape still
 * comes from {@link createPMTilesStoreLayer}.
 */
export async function addPMTilesAsset(
  href: string,
  name: string,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  const info = await readRemotePMTilesInfo(href);
  signal?.throwIfAborted();

  const id = createLayerId();
  useAppStore.getState().addLayer(
    createPMTilesStoreLayer({
      id,
      name,
      url: href,
      tileType: info.tileType,
      sourceLayers: info.sourceLayers,
    }),
  );
  return id;
}
