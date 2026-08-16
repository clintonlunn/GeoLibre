import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { syncLayer } from "../packages/map/src/layer-sync";
import { createPMTilesStoreLayer } from "../packages/map/src/pmtiles-layer";

interface MapCall {
  method: string;
  args: unknown[];
}

/** Enough of a MapLibre map to record what a sync pass adds, starting from an empty style. */
function makeMapStub() {
  const calls: MapCall[] = [];
  const sources = new Set<string>();
  const layers = new Set<string>();
  const map = {
    getStyle: () => ({ layers: [...layers].map((id) => ({ id, type: "fill" })) }),
    getLayer: (id: string) => (layers.has(id) ? { id, type: "fill" } : undefined),
    getSource: (id: string) => (sources.has(id) ? { id } : undefined),
    addSource: (id: string, source: unknown) => {
      sources.add(id);
      calls.push({ method: "addSource", args: [id, source] });
    },
    addLayer: (layer: { id: string }) => {
      layers.add(layer.id);
      calls.push({ method: "addLayer", args: [layer] });
    },
    removeLayer: () => {},
    removeSource: () => {},
    moveLayer: () => {},
    setLayoutProperty: () => {},
    setPaintProperty: () => {},
    setLayerZoomRange: () => {},
  };
  const added = (method: string) => calls.filter((call) => call.method === method);
  return { map, added };
}

const archive = {
  id: "layer-1",
  name: "Geologic units",
  url: "https://example.org/units.pmtiles",
  tileType: "vector" as const,
  sourceLayers: ["units"],
};

describe("syncing a layer from createPMTilesStoreLayer", () => {
  it("adds the archive as a vector source and one MapLibre layer per declared id", () => {
    const layer = createPMTilesStoreLayer(archive);
    const { map, added } = makeMapStub();

    syncLayer(map as never, layer);

    assert.deepEqual(added("addSource")[0]?.args, [
      "layer-1",
      { type: "vector", url: "pmtiles://https://example.org/units.pmtiles" },
    ]);
    // The ids the builder promised are exactly the ones the sync creates: a layer whose
    // nativeLayerIds name something else renders nothing while claiming it renders.
    assert.deepEqual(
      added("addLayer").map((call) => (call.args[0] as { id: string }).id),
      layer.metadata.nativeLayerIds,
    );
    for (const call of added("addLayer")) {
      assert.equal((call.args[0] as Record<string, unknown>)["source-layer"], "units");
      assert.equal((call.args[0] as Record<string, unknown>).source, "layer-1");
    }
  });

  it("adds a raster archive as a raster source and its single layer", () => {
    const layer = createPMTilesStoreLayer({ ...archive, tileType: "raster", sourceLayers: [] });
    const { map, added } = makeMapStub();

    syncLayer(map as never, layer);

    assert.equal((added("addSource")[0]?.args[1] as { type: string }).type, "raster");
    assert.deepEqual(
      added("addLayer").map((call) => (call.args[0] as { id: string }).id),
      ["layer-1-raster"],
    );
  });

  it("renders a source layer whose name needs encoding in a layer id", () => {
    const layer = createPMTilesStoreLayer({ ...archive, sourceLayers: ["water lines"] });
    const { map, added } = makeMapStub();

    syncLayer(map as never, layer);

    assert.deepEqual(
      added("addLayer").map((call) => (call.args[0] as { id: string }).id),
      layer.metadata.nativeLayerIds,
    );
    // The source-layer keeps the archive's own name; only the id is encoded.
    assert.equal(
      (added("addLayer")[0]?.args[0] as Record<string, unknown>)["source-layer"],
      "water lines",
    );
    assert.equal((layer.metadata.nativeLayerIds as string[])[0], "layer-1-water_20lines-fill");
  });
});
