import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { PMTilesLayerInfo } from "maplibre-gl-components";
import { useAppStore } from "../packages/core/src/store";
import { createPMTilesArchiveLayers } from "../packages/map/src/pmtiles-layer";
import { addPMTilesArchive } from "../packages/plugins/src/plugins/pmtiles-archive-store";
import {
  __resetPMTilesControlOwnershipForTests,
  createPMTilesLayerAddHandler,
  createPMTilesLayerRemoveHandler,
  teardownPMTilesControl,
} from "../packages/plugins/src/plugins/maplibre-components";

/** What the control reports for an archive it has loaded, with `sourceLayers` it has discovered. */
function addEvent(sourceLayers: string[], id = "pmtiles-1") {
  const layer: PMTilesLayerInfo = {
    id,
    url: "https://example.org/units.pmtiles",
    name: "Units",
    tileType: "vector",
    sourceLayers,
    layerIds: [],
    opacity: 0.8,
    pickable: true,
  };
  return { layerId: id, state: { layers: [layer] } } as never;
}

function archiveLayers() {
  const state = useAppStore.getState();
  return state.layers.filter((layer) => layer.id.startsWith("pmtiles-1"));
}

// A catalog asset and a control add go through one function, so an archive opened from STAC is
// taken apart the same way rather than landing as one flat layer.
describe("adding an archive from anywhere", () => {
  beforeEach(() => {
    __resetPMTilesControlOwnershipForTests();
    const state = useAppStore.getState();
    for (const layer of [...state.layers]) state.removeLayer(layer.id);
    for (const group of [...state.layerGroups]) state.removeLayerGroup(group.id);
  });

  it("splits and folders it whichever door it came in", () => {
    const layers = createPMTilesArchiveLayers({
      id: "asset-1",
      name: "Quaternary faults",
      url: "https://example.org/qfaults.pmtiles",
      tileType: "vector",
      sourceLayers: ["faults", "folds"],
    });

    const added = addPMTilesArchive(layers, "Quaternary faults");

    const state = useAppStore.getState();
    assert.deepEqual(added, ["asset-1-faults", "asset-1-folds"]);
    assert.equal(state.layerGroups.length, 1);
    assert.equal(state.layerGroups[0]!.name, "Quaternary faults");
    assert.deepEqual(
      new Set(state.layers.map((layer) => layer.groupId)),
      new Set([state.layerGroups[0]!.id]),
    );
  });

  // The control discovers source layers as metadata arrives, and one source layer is named after
  // the archive while several are named after each — so a second read can change the id scheme.
  it("replaces the archive when a later read finds more source layers", () => {
    const one = createPMTilesArchiveLayers({
      id: "asset-3",
      name: "Faults",
      url: "https://example.org/f.pmtiles",
      tileType: "vector",
      sourceLayers: ["faults"],
    });
    addPMTilesArchive(one, "Faults");
    assert.deepEqual(
      useAppStore.getState().layers.map((layer) => layer.id),
      ["asset-3"],
    );

    const many = createPMTilesArchiveLayers({
      id: "asset-3",
      name: "Faults",
      url: "https://example.org/f.pmtiles",
      tileType: "vector",
      sourceLayers: ["faults", "folds"],
    });
    addPMTilesArchive(many, "Faults");

    assert.deepEqual(
      useAppStore.getState().layers.map((layer) => layer.id),
      ["asset-3-faults", "asset-3-folds"],
      "the layer under the old scheme went with it",
    );
  });

  it("takes the old folder with the old shape, rather than leaving an empty one", () => {
    const shaped = (sourceLayers: string[]) =>
      createPMTilesArchiveLayers({
        id: "asset-4",
        name: "Faults",
        url: "https://example.org/f.pmtiles",
        tileType: "vector",
        sourceLayers,
      });
    addPMTilesArchive(shaped(["faults", "folds"]), "Faults");
    assert.equal(useAppStore.getState().layerGroups.length, 1, "the split archive made a folder");

    // A later read finds only one source layer, so the archive is one layer named after itself.
    addPMTilesArchive(shaped(["faults"]), "Faults");

    const state = useAppStore.getState();
    assert.deepEqual(
      state.layers.map((layer) => layer.id),
      ["asset-4"],
    );
    assert.deepEqual(state.layerGroups, [], "the folder the split layers sat in went with them");
  });

  // The store subscriber reads "no layers left for this archive" as the archive being gone and
  // tells the control so, which hands back the ownership the replacing layers need. So the archive
  // must never be momentarily layerless while it changes shape.
  it("never leaves the archive layerless while it changes shape", () => {
    const shaped = (sourceLayers: string[]) =>
      createPMTilesArchiveLayers({
        id: "asset-6",
        name: "Faults",
        url: "https://example.org/f.pmtiles",
        tileType: "vector",
        sourceLayers,
      });
    addPMTilesArchive(shaped(["faults"]), "Faults");

    const counts: number[] = [];
    const unsubscribe = useAppStore.subscribe((state) => {
      counts.push(state.layers.filter((l) => l.metadata.sourceId === "asset-6").length);
    });
    addPMTilesArchive(shaped(["faults", "folds"]), "Faults");
    unsubscribe();

    assert.ok(counts.length > 0, "the store did change");
    assert.ok(!counts.includes(0), `archive was empty at some point: ${counts.join(",")}`);
  });

  it("puts only the layers it added into a new folder", () => {
    const shaped = (sourceLayers: string[]) =>
      createPMTilesArchiveLayers({
        id: "asset-7",
        name: "Faults",
        url: "https://example.org/f.pmtiles",
        tileType: "vector",
        sourceLayers,
      });
    addPMTilesArchive(shaped(["faults", "folds"]), "Faults");
    // The user takes both out of the folder and deletes it.
    const first = useAppStore.getState();
    first.moveLayersToGroup(
      first.layers.map((layer) => layer.id),
      null,
    );
    for (const group of [...useAppStore.getState().layerGroups]) {
      useAppStore.getState().removeLayerGroup(group.id);
    }

    addPMTilesArchive(shaped(["faults", "folds", "scarps"]), "Faults");

    const state = useAppStore.getState();
    assert.equal(state.layerGroups.length, 1);
    const inFolder = state.layers.filter((l) => l.groupId === state.layerGroups[0]!.id);
    assert.deepEqual(
      inFolder.map((l) => l.id),
      ["asset-7-scarps"],
      "the ones the user pulled out stay out",
    );
  });

  it("leaves a single-source-layer archive as the one layer it is", () => {
    const layers = createPMTilesArchiveLayers({
      id: "asset-2",
      name: "Parcels",
      url: "https://example.org/parcels.pmtiles",
      tileType: "vector",
      sourceLayers: ["parcels"],
    });

    const added = addPMTilesArchive(layers, "Parcels");

    assert.deepEqual(added, ["asset-2"], "no per-source-layer id, and so no folder");
    assert.deepEqual(useAppStore.getState().layerGroups, []);
  });
});

describe("the folder an archive's source layers are added into", () => {
  beforeEach(() => {
    __resetPMTilesControlOwnershipForTests();
    const state = useAppStore.getState();
    for (const layer of [...state.layers]) state.removeLayer(layer.id);
    for (const group of [...state.layerGroups]) state.removeLayerGroup(group.id);
  });

  it("puts every source layer in one folder named after the archive", () => {
    createPMTilesLayerAddHandler()(addEvent(["roads", "water"]));

    const groups = useAppStore.getState().layerGroups;
    assert.equal(groups.length, 1);
    assert.equal(groups[0]!.name, "Units");
    assert.deepEqual(
      new Set(archiveLayers().map((layer) => layer.groupId)),
      new Set([groups[0]!.id]),
    );
  });

  it("takes the folder away with the archive, rather than leaving it empty", () => {
    const handle = createPMTilesLayerAddHandler();
    handle(addEvent(["roads", "water"]));
    assert.equal(useAppStore.getState().layerGroups.length, 1);

    createPMTilesLayerRemoveHandler()({ layerId: "pmtiles-1", state: { layers: [] } });

    const state = useAppStore.getState();
    assert.deepEqual(archiveLayers(), [], "every layer of the archive went");
    assert.deepEqual(state.layerGroups, [], "and its folder went with them");
  });

  it("leaves a folder standing when the user has put something else in it", () => {
    const handle = createPMTilesLayerAddHandler();
    handle(addEvent(["roads", "water"]));
    const groupId = useAppStore.getState().layerGroups[0]!.id;
    // Not one of the archive's: a layer the user dragged into the same folder.
    const source = archiveLayers()[0]!;
    const mine = {
      ...source,
      id: "a-layer-of-my-own",
      groupId: undefined,
      metadata: { ...source.metadata, sourceKind: "geojson-file", sourceId: "mine" },
    };
    useAppStore.getState().addLayer(mine);
    useAppStore.getState().moveLayersToGroup([mine.id], groupId);

    createPMTilesLayerRemoveHandler()({ layerId: "pmtiles-1", state: { layers: [] } });

    const state = useAppStore.getState();
    assert.deepEqual(archiveLayers(), [], "the archive still went");
    assert.equal(state.layerGroups.length, 1, "but the folder stayed, holding the user's layer");
    assert.deepEqual(
      state.layers.map((layer) => layer.id),
      [mine.id],
    );
  });

  // A `layerremove` names one archive. Releasing every archive missing from its snapshot would hand
  // back ownership of ones the event never mentioned, and the control could no longer clear those.
  it("keeps its claim on the archives an event did not name", () => {
    const handle = createPMTilesLayerAddHandler();
    handle(addEvent(["roads", "water"]));
    handle(addEvent(["parcels"], "pmtiles-2"));

    // The control drops the first archive, and its snapshot lists neither.
    createPMTilesLayerRemoveHandler()({ layerId: "pmtiles-1", state: { layers: [] } });
    // The second archive is still the control's, so its own clear-all still takes it.
    createPMTilesLayerRemoveHandler()({ layerId: "pmtiles-2", state: { layers: [] } });

    assert.deepEqual(useAppStore.getState().layers, [], "both archives went");
  });

  // Closing the panel destroys the control; reopening builds one holding nothing, while the layers
  // it added are still on the map.
  it("stops being the control's once the panel that added it has closed", () => {
    createPMTilesLayerAddHandler()(addEvent(["roads", "water"]));
    teardownPMTilesControl({ removeMapControl: () => true } as never);

    createPMTilesLayerRemoveHandler()({ state: { layers: [] } });

    assert.equal(archiveLayers().length, 2, "a new control's clear-all does not take them");
  });

  // The control discovers an archive's source layers as its metadata arrives, so a second event can
  // report one the first did not. That layer belongs with its siblings, not in a folder of its own.
  it("puts a source layer a later event reports into the folder that already exists", () => {
    const handle = createPMTilesLayerAddHandler();
    handle(addEvent(["roads", "water"]));
    const groupId = useAppStore.getState().layerGroups[0]!.id;

    handle(addEvent(["roads", "water", "buildings"]));

    const groups = useAppStore.getState().layerGroups;
    assert.equal(groups.length, 1, "no second folder beside the first");
    assert.equal(groups[0]!.id, groupId, "and it is the same folder");
    const layers = archiveLayers();
    assert.equal(layers.length, 3, "the newly reported source layer was added");
    assert.deepEqual(
      new Set(layers.map((layer) => layer.groupId)),
      new Set([groupId]),
      "every source layer sits in it, the late one included",
    );
  });
});
