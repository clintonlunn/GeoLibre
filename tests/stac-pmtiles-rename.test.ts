import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { useAppStore } from "@geolibre/core";
import { createPMTilesStoreLayer } from "../packages/map/src/pmtiles-layer";
import { renamePMTilesLayer } from "../packages/plugins/src/plugins/stac-layers";

const HREF = "https://example.org/warehouse/units.pmtiles";

function addArchive(id: string, href: string, name: string) {
  useAppStore.getState().addLayer(
    createPMTilesStoreLayer({
      id,
      name,
      url: href,
      tileType: "vector",
      sourceLayers: ["units"],
    }),
  );
}

describe("naming the layer a PMTiles asset produced", () => {
  it("renames the archive the control just added", () => {
    useAppStore.setState({ layers: [] });
    addArchive("layer-1", HREF, "units");

    renamePMTilesLayer(HREF, "item-1 — PMTiles vector tiles");

    assert.equal(useAppStore.getState().layers[0]?.name, "item-1 — PMTiles vector tiles");
  });

  it("leaves other archives alone", () => {
    useAppStore.setState({ layers: [] });
    addArchive("layer-1", "https://example.org/other.pmtiles", "other");
    addArchive("layer-2", HREF, "units");

    renamePMTilesLayer(HREF, "item-1 — PMTiles vector tiles");

    assert.deepEqual(
      useAppStore.getState().layers.map((layer) => layer.name),
      ["other", "item-1 — PMTiles vector tiles"],
    );
  });

  it("does nothing when the control produced no layer, rather than naming the wrong one", () => {
    useAppStore.setState({ layers: [] });
    addArchive("layer-1", "https://example.org/other.pmtiles", "other");

    renamePMTilesLayer(HREF, "item-1 — PMTiles vector tiles");

    assert.deepEqual(
      useAppStore.getState().layers.map((layer) => layer.name),
      ["other"],
    );
  });
});
