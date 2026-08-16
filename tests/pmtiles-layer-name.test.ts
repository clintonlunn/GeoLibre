import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PMTilesLayerInfo } from "maplibre-gl-components";
import {
  resolvePMTilesLayerName,
  setPendingPMTilesName,
} from "../packages/plugins/src/plugins/maplibre-components";

function layerInfo(patch: Partial<PMTilesLayerInfo> = {}): PMTilesLayerInfo {
  return {
    id: "pmtiles-1",
    url: "https://example.org/warehouse/units.pmtiles",
    name: "",
    tileType: "vector",
    sourceLayers: ["units"],
    layerIds: ["pmtiles-1-units-fill"],
    opacity: 1,
    pickable: true,
    ...patch,
  };
}

describe("naming a PMTiles layer a caller asked for", () => {
  it("uses the name the caller left, not the file name", () => {
    setPendingPMTilesName("item-1 — PMTiles vector tiles");

    assert.equal(resolvePMTilesLayerName(layerInfo(), "layer-1"), "item-1 — PMTiles vector tiles");
  });

  it("spends the name once, so a layer the panel adds next is named for itself", () => {
    const info = layerInfo();
    setPendingPMTilesName("item-1 — PMTiles vector tiles");
    resolvePMTilesLayerName(info, "layer-1");

    assert.equal(resolvePMTilesLayerName(info, "layer-2"), "units");
  });

  it("drops a name whose add never produced a layer", () => {
    const info = layerInfo();
    const clear = setPendingPMTilesName("item-1 — PMTiles vector tiles");
    clear();

    assert.equal(resolvePMTilesLayerName(info, "layer-1"), "units");
  });

  it("falls back when a caller queues an empty name, rather than naming the layer nothing", () => {
    const info = layerInfo({ name: "Named by the panel" });
    setPendingPMTilesName("");

    assert.equal(resolvePMTilesLayerName(info, "layer-1"), "Named by the panel");
  });

  it("keeps the control's own name when the caller supplied none", () => {
    assert.equal(
      resolvePMTilesLayerName(layerInfo({ name: "Named by the panel" }), "layer-1"),
      "Named by the panel",
    );
  });
});
