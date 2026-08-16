import { useAppStore } from "@geolibre/core";

/**
 * Give the layer the control just made the item and asset it came from. The control names a layer
 * after its file, and takes no name of its own, so the panel that asked for it renames it after.
 * The control adds the layer while `addLayer` runs, so it is in the store by the time this runs; if
 * a future version defers that, the layer keeps its file name rather than taking a wrong one.
 */
export function renamePMTilesLayer(href: string, name: string): void {
  const store = useAppStore.getState();
  const added = store.layers.find(
    (layer) => layer.type === "pmtiles" && layer.source.url === `pmtiles://${href}`,
  );
  if (added) store.updateLayer(added.id, { name });
}
