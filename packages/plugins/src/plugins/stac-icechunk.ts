/**
 * Reading an Icechunk repository, which is a manifest rather than a Zarr hierarchy: a branch names
 * a snapshot, and the snapshot maps every Zarr key to the bytes that hold it. The renderer takes a
 * store with a `get`, so a repository reaches it through {@link ZarrRasterLayerOptions.store} the
 * way a kerchunk reference store or a folder on disk does.
 *
 * `icechunk-js` rather than Earth Mover's own `@earthmover/icechunk`: that one's browser build is
 * WASI and fails here with `SharedArrayBuffer transfer requires self.crossOriginIsolated`. Serving
 * GeoLibre cross-origin-isolated does work (`COEP: credentialless` left tiles, catalogs and remote
 * stores loading in a trial), but it is an app-wide policy next to a 6.8 MB wasm payload. Worth
 * revisiting if earth-mover/icechunk#2065 lands an emscripten build, which is the piece that would
 * drop the isolation requirement.
 *
 * The import is dynamic: the reader carries its own msgpack and flatbuffers parsers, which no
 * session that never opens an Icechunk asset should pay for.
 */

import { createZarrMetadataReader } from "./zarr-metadata-reader";
import { readCoordinateTimeAttributes, type ZarrTimeAttributes } from "./zarr-time-axis";

/**
 * The reader contract the Zarr renderer wants, and the one an Icechunk store already satisfies.
 *
 * Keys are rooted because the library's are (`AbsolutePath`), and it is load-bearing rather than
 * cosmetic: a manifest answers `/time/zarr.json` and returns nothing at all for `time/zarr.json`.
 * Spelling it in the type is what keeps a caller from finding that out at runtime.
 */
export interface ZarrKeyReader {
  get(key: `/${string}`, options?: { signal?: AbortSignal }): Promise<Uint8Array | undefined>;
}

/** The branch a catalog reads when it names none. */
export const DEFAULT_ICECHUNK_BRANCH = "main";

/**
 * One reader per repository and branch, for the life of the page.
 *
 * Opening walks `refs` to a snapshot and then its manifests, so a cube whose item lists a dozen
 * variables would pay for that a dozen times over as each is added. Sharing also pins those layers
 * to one snapshot, which is the more defensible reading of a format built on immutable ones: two
 * variables added a minute apart belong to the same picture of the data, not to two.
 *
 * The cost is that a repository is opened once and then not again: a snapshot committed after the
 * first add is not picked up until the page reloads. That is the right trade while a session is a
 * sitting worth of work, and the wrong one for a session left open against a repository being
 * written to — if that turns up, this is the place to add an expiry rather than a second cache.
 */
const openRepositories = new Map<string, Promise<ZarrKeyReader>>();

/** Forget every opened repository. Exported for tests, which must not share state between them. */
export function __resetIcechunkRepositoriesForTests(): void {
  openRepositories.clear();
}

/**
 * Open a repository for reading.
 *
 * Deliberately passes no `formatVersion`: the reader probes for the `repo` object a v2 archive
 * carries and falls back to the `refs/` layout of a v1 one. Pinning either skips that probe and
 * fails on the other with a reference-not-found error rather than anything a user could act on.
 * The cost is one 404 for `<url>/repo` when opening a v1 archive — the probe missing, not the
 * repository failing — which is the only request GeoLibre expects to see fail on this path.
 *
 * The branch is catalog-controlled and reaches a request path unencoded (`refs/branch.<name>/`),
 * so a name containing `../` walks it. That grants nothing: the same catalog supplies `url`, so
 * anything reachable that way is reachable by publishing a different href.
 *
 * @param url Store URL, as the catalog published it.
 * @param branch Branch to read, defaulting to {@link DEFAULT_ICECHUNK_BRANCH}.
 * @param signal Drops this caller out when the panel stops caring — clearing results or closing
 *   it. The shared open itself runs on, since another add may be waiting for the same repository.
 * @returns A reader over the branch's current snapshot.
 */
export async function openIcechunkStore(
  url: string,
  branch: string = DEFAULT_ICECHUNK_BRANCH,
  signal?: AbortSignal,
): Promise<ZarrKeyReader> {
  signal?.throwIfAborted();
  const key = `${url}|${branch}`;
  let pending = openRepositories.get(key);
  if (!pending) {
    // Deliberately opened without the caller's signal. The open is shared, so honouring one
    // caller's abort would cancel it for every other add waiting on the same repository. Each
    // caller drops out on its own signal instead, and the walk it was waiting for finishes for
    // whoever else wanted it — a bounded read of refs and manifests, not an open-ended transfer.
    pending = (async () => {
      const { IcechunkStore } = await import("icechunk-js");
      // Uncast, so that a change to the library's own reader contract — the key shape above most
      // of all — fails the build rather than the layer.
      return IcechunkStore.open(url, { branch });
    })();
    openRepositories.set(key, pending);
    // Only a repository that opened is kept. A failure evicts, so a store that was unreachable
    // once is retried on the next add rather than refusing for the life of the page.
    const opening = pending;
    void opening.catch(() => {
      if (openRepositories.get(key) === opening) openRepositories.delete(key);
    });
  }
  const store = await pending;
  signal?.throwIfAborted();
  return store;
}

/**
 * A reader for the CF `units`/`calendar` of an Icechunk repository's coordinate.
 *
 * The Time Slider otherwise fetches these from the store's URL, which for a repository is a run of
 * 404s and a binding that never happens: the objects live behind the manifest.
 *
 * @param store The reader {@link openIcechunkStore} returned.
 * @returns A reader over that repository's coordinate attributes.
 */
export function icechunkTimeAttributesReader(
  store: ZarrKeyReader,
): (dimension: string) => Promise<ZarrTimeAttributes | null> {
  // Only the rooting is this store's own — a manifest answers `/time/zarr.json` and nothing at all
  // for `time/zarr.json`. The decode is the same one a folder on disk gets.
  const readDocument = createZarrMetadataReader((key) => store.get(`/${key}`));
  return (dimension: string) => readCoordinateTimeAttributes(readDocument, dimension);
}
