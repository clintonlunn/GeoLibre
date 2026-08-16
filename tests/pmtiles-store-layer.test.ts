import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEmptyProject, parseProject, serializeProject } from "@geolibre/core";
import { createPMTilesStoreLayer } from "../packages/map/src/pmtiles-layer";
import { isPlaceholderLayer } from "../packages/map/src/placeholders";

const archive = {
  id: "layer-1",
  name: "Geologic units",
  url: "https://example.org/units.pmtiles",
  tileType: "vector" as const,
  sourceLayers: ["units"],
};

describe("createPMTilesStoreLayer", () => {
  it("builds a layer syncLayers renders rather than a placeholder", () => {
    const layer = createPMTilesStoreLayer(archive);

    assert.equal(isPlaceholderLayer(layer), false);
    assert.equal(layer.metadata.sourceKind, "pmtiles-url");
    assert.equal(layer.metadata.externalNativeLayer, true);
    assert.deepEqual(layer.metadata.nativeLayerIds, [
      "layer-1-units-fill",
      "layer-1-units-line",
      "layer-1-units-circle",
    ]);
  });

  it("names the source after the layer, so the derived native ids address it", () => {
    const layer = createPMTilesStoreLayer(archive);

    assert.equal(layer.source.sourceId, "layer-1");
    assert.equal(layer.metadata.sourceId, "layer-1");
  });

  it("mirrors the source's facts in metadata, which is where later readers look", () => {
    const layer = createPMTilesStoreLayer(archive);

    assert.deepEqual(layer.metadata.sourceLayers, layer.source.sourceLayers);
    assert.equal(layer.metadata.tileType, layer.source.tileType);
  });

  it("adds the pmtiles protocol once, whether or not the caller did", () => {
    const bare = createPMTilesStoreLayer(archive);
    const prefixed = createPMTilesStoreLayer({ ...archive, url: "pmtiles://registered-archive" });

    assert.equal(bare.source.url, "pmtiles://https://example.org/units.pmtiles");
    assert.equal(bare.sourcePath, bare.source.url);
    assert.equal(prefixed.source.url, "pmtiles://registered-archive");
  });

  it("gives a raster archive the single raster layer id", () => {
    const layer = createPMTilesStoreLayer({ ...archive, tileType: "raster", sourceLayers: [] });

    assert.equal(isPlaceholderLayer(layer), false);
    assert.equal(layer.source.type, "raster");
    assert.deepEqual(layer.metadata.nativeLayerIds, ["layer-1-raster"]);
  });

  it("still renders after a save and reload, which is where the metadata has to survive", () => {
    const project = createEmptyProject("units");
    project.layers = [createPMTilesStoreLayer(archive)];

    const [reloaded] = parseProject(serializeProject(project)).layers;

    assert.ok(reloaded);
    assert.equal(isPlaceholderLayer(reloaded), false);
    assert.deepEqual(reloaded.metadata.nativeLayerIds, project.layers[0]?.metadata.nativeLayerIds);
    assert.equal(reloaded.source.url, "pmtiles://https://example.org/units.pmtiles");
  });

  it("keeps the ids a control made itself instead of deriving its own", () => {
    const layer = createPMTilesStoreLayer({ ...archive, nativeLayerIds: ["control-fill"] });

    assert.deepEqual(layer.metadata.nativeLayerIds, ["control-fill"]);
  });

  it("paints a source layer its own color and takes the caller's style over the defaults", () => {
    const layer = createPMTilesStoreLayer({
      ...archive,
      sourceLayerColors: { units: "#ff0000" },
      style: { fillOpacity: 0.6 },
    });

    assert.equal(layer.style.fillColor, "#ff0000");
    assert.equal(layer.style.strokeColor, "#ff0000");
    assert.equal(layer.style.fillOpacity, 0.6);

    const painted = createPMTilesStoreLayer({
      ...archive,
      sourceLayerColors: { units: "#ff0000" },
      style: { fillColor: "#00ff00" },
    });

    assert.equal(painted.style.fillColor, "#00ff00");
  });
});
