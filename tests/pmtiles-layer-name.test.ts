import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PMTilesLayerInfo } from "maplibre-gl-components";
import {
  resolvePMTilesLayerName,
  setPendingPMTilesName,
} from "../packages/plugins/src/plugins/maplibre-components";

function layerInfo(patch: Partial<PMTilesLayerInfo> = {}): PMTilesLayerInfo {
  return {
    url: "https://example.org/warehouse/units.pmtiles",
    name: "",
    ...patch,
  } as PMTilesLayerInfo;
}

describe("naming a PMTiles layer a caller asked for", () => {
  it("uses the name the caller left, not the file name", () => {
    setPendingPMTilesName(layerInfo().url, "item-1 — PMTiles vector tiles");

    assert.equal(resolvePMTilesLayerName(layerInfo(), "layer-1"), "item-1 — PMTiles vector tiles");
  });

  it("spends the name once, so the next archive from the same URL is named for itself", () => {
    const info = layerInfo();
    setPendingPMTilesName(info.url, "item-1 — PMTiles vector tiles");
    resolvePMTilesLayerName(info, "layer-1");

    assert.equal(resolvePMTilesLayerName(info, "layer-2"), "units");
  });

  it("leaves an unrelated archive alone", () => {
    setPendingPMTilesName("https://example.org/other.pmtiles", "somebody else's name");

    assert.equal(resolvePMTilesLayerName(layerInfo(), "layer-1"), "units");
  });

  it("drops a name whose add never produced a layer", () => {
    const info = layerInfo();
    const clear = setPendingPMTilesName(info.url, "item-1 — PMTiles vector tiles");
    clear();

    assert.equal(resolvePMTilesLayerName(info, "layer-1"), "units");
  });

  it("keeps each concurrent add's own name when both are for the same archive", () => {
    const info = layerInfo();
    setPendingPMTilesName(info.url, "first item");
    setPendingPMTilesName(info.url, "second item");

    assert.equal(resolvePMTilesLayerName(info, "layer-1"), "first item");
    assert.equal(resolvePMTilesLayerName(info, "layer-2"), "second item");
  });

  it("drops only the cancelled add's name, leaving the other in the queue", () => {
    const info = layerInfo();
    const clearFirst = setPendingPMTilesName(info.url, "first item");
    setPendingPMTilesName(info.url, "second item");
    clearFirst();

    assert.equal(resolvePMTilesLayerName(info, "layer-1"), "second item");
  });

  it("keeps the control's own name when the caller supplied none", () => {
    assert.equal(
      resolvePMTilesLayerName(layerInfo({ name: "Named by the panel" }), "layer-1"),
      "Named by the panel",
    );
  });
});
