/**
 * Putting a PMTiles archive into the store: the pieces go in one at a time, then into a folder.
 * Shared so an archive from the control and one from a STAC asset cannot drift apart.
 */

import { type GeoLibreLayer, useAppStore } from "@geolibre/core";

/**
 * Add an archive's layers, or update them where they are already on the map.
 *
 * @param layers - What {@link createPMTilesArchiveLayers} built.
 * @param name - What to call the folder holding them.
 * @returns The ids newly added; empty when every layer was already there.
 */
export function addPMTilesArchive(layers: readonly GeoLibreLayer[], name: string): string[] {
  const store = useAppStore.getState();
  // Taken before the adds: ids within one archive are distinct, so nothing added here reads back.
  const known = new Set(store.layers.map((item) => item.id));
  const ids = new Set(layers.map((layer) => layer.id));
  const added: string[] = [];
  for (const layer of layers) {
    if (known.has(layer.id)) {
      store.updateLayer(layer.id, {
        metadata: layer.metadata,
        opacity: layer.opacity,
        source: layer.source,
        style: layer.style,
        visible: layer.visible,
      });
      continue;
    }
    store.addLayer(layer);
    added.push(layer.id);
  }
  // Only after the adds: the archive must never be momentarily layerless, or the store subscriber
  // reads it as gone, tells the control so, and hands back the ownership the new layers need.
  //
  // A later read can report a different set of source layers, and one source layer is named after
  // the archive itself while several are named after each — so the same archive can arrive under a
  // different id scheme. What it used to be goes, or it stays on the map drawing the whole archive
  // underneath the layers that replaced it.
  const archiveId = layers[0]?.metadata.sourceId;
  if (typeof archiveId === "string") {
    const emptied = new Set<string | undefined>();
    for (const stale of store.layers) {
      // `metadata.sourceId` is a generic key other layer kinds set too, so the type is checked
      // rather than trusting an id match to mean "a layer of this archive".
      if (stale.type !== "pmtiles" || stale.metadata.sourceId !== archiveId) continue;
      if (ids.has(stale.id)) continue;
      emptied.add(stale.groupId);
      store.removeLayer(stale.id);
    }
    // The folder the old shape sat in goes with it when nothing is left in it, the same way the
    // control's own removal prunes one — otherwise the archive comes back beside an empty husk.
    const afterStale = useAppStore.getState();
    for (const groupId of emptied) {
      if (!groupId) continue;
      if (afterStale.layers.some((layer) => layer.groupId === groupId)) continue;
      afterStale.removeLayerGroup(groupId);
    }
  }
  // Read back after the adds, so a source layer reported later joins the folder its siblings are in.
  if (layers.length > 1 && added.length > 0) {
    const state = useAppStore.getState();
    // A sibling's folder, when one is still in a folder. A user who has dragged every sibling out
    // has said this archive is not a folder any more, so the layer being added now starts a fresh
    // one rather than being pulled back into the folder they emptied.
    const existing = state.layers.find((item) => ids.has(item.id) && item.groupId)?.groupId;
    if (existing) {
      state.moveLayersToGroup(added, existing);
    } else {
      state.addLayerGroup(name, added);
    }
  }
  return added;
}
