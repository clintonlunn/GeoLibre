/**
 * Reading a Zarr store's metadata documents, whatever the store is made of.
 *
 * A store's `units`, `calendar`, `node_type` and the rest live in small JSON documents keyed like
 * any other object — `.zattrs`, `zarr.json`, `.zarray`. Where those bytes come from differs (an
 * HTTP request, a folder on disk, an Icechunk manifest) but what happens to them does not: decode,
 * parse, and treat anything that is not a JSON object as a key the store does not carry.
 *
 * That last part is the reason this is shared rather than written per store. "Absent" and
 * "unreadable" have to collapse into the same answer for the walk above to work, and a reader that
 * threw where its sibling returned nothing would make the same store report different verdicts
 * depending on how it was opened.
 */

/**
 * Reads one of a store's metadata documents.
 *
 * @param key - Store-relative key, e.g. `.zmetadata` or `time/.zattrs`.
 * @returns The parsed JSON document, or undefined when the key is absent.
 */
export type ZarrMetadataReader = (key: string) => Promise<unknown | undefined>;

/**
 * Build a {@link ZarrMetadataReader} over any source of bytes.
 *
 * @param readBytes - Resolves a store-relative key to its bytes, or to nothing when the store does
 *   not carry it. Where a store roots or normalizes its keys, that belongs here: a folder strips
 *   the leading slash zarrita adds, an Icechunk manifest requires it.
 * @returns A reader resolving each metadata key to its parsed JSON document.
 */
export function createZarrMetadataReader(
  readBytes: (key: string) => Promise<Uint8Array | undefined>,
): ZarrMetadataReader {
  return async (key: string) => {
    let bytes: Uint8Array | undefined;
    try {
      bytes = await readBytes(key);
    } catch {
      // A store that refuses one key has not failed: most of the keys a walk asks for are absent
      // from any given store, so a refusal moves to the next rather than ending the walk.
      return undefined;
    }
    if (!bytes) return undefined;
    try {
      return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    } catch {
      // A key that exists but is not JSON is not a metadata document.
      return undefined;
    }
  };
}
