import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __resetIcechunkRepositoriesForTests,
  DEFAULT_ICECHUNK_BRANCH,
  icechunkTimeAttributesReader,
  openIcechunkStore,
} from "../packages/plugins/src/plugins/stac-icechunk.ts";

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

// An Icechunk repository serves nothing at its URL, so the Time Slider's usual
// metadata walk 404s six times and never binds. The reader answers the same
// question through the manifest the data already comes through.
describe("icechunkTimeAttributesReader", () => {
  it("reads the coordinate's attributes through the store", async () => {
    const asked: string[] = [];
    const read = icechunkTimeAttributesReader({
      get: async (key) => {
        asked.push(key);
        return key === "/time/.zattrs"
          ? encode({ units: "days since 1980-01-01", calendar: "standard" })
          : undefined;
      },
    });
    assert.deepEqual(await read("time"), {
      units: "days since 1980-01-01",
      calendar: "standard",
    });
    // Keys reach the manifest rooted, the way the target check asks for them.
    assert.ok(asked.every((key) => key.startsWith("/")));
  });

  it("looks inside the first pyramid level as well as the root", async () => {
    const read = icechunkTimeAttributesReader({
      get: async (key) =>
        key === "/0/time/zarr.json"
          ? encode({ attributes: { units: "hours since 2000-01-01" } })
          : undefined,
    });
    assert.deepEqual(await read("time"), { units: "hours since 2000-01-01" });
  });

  it("keeps walking when the manifest refuses a key", async () => {
    const read = icechunkTimeAttributesReader({
      get: async (key) => {
        if (key === "/time/.zattrs") throw new Error("not in this snapshot");
        return key === "/time/zarr.json"
          ? encode({ attributes: { calendar: "noleap" } })
          : undefined;
      },
    });
    assert.deepEqual(await read("time"), { calendar: "noleap" });
  });

  it("treats a key that is not a metadata document as absent", async () => {
    const read = icechunkTimeAttributesReader({
      get: async () => new TextEncoder().encode("not json"),
    });
    assert.equal(await read("time"), null);
  });

  it("reports no attributes when no document declares any", async () => {
    const read = icechunkTimeAttributesReader({ get: async () => undefined });
    assert.equal(await read("time"), null);
  });
});

// A cube's variables are added one at a time, and each add would otherwise walk refs, snapshot and
// manifests again for a repository already open.
describe("openIcechunkStore", () => {
  it("abandons an aborted open without loading the reader", async () => {
    __resetIcechunkRepositoriesForTests();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      openIcechunkStore("https://example.com/repo", "main", controller.signal),
      (error: Error) => error.name === "AbortError",
    );
  });

  it("names the branch a catalog publishes nothing for", () => {
    assert.equal(DEFAULT_ICECHUNK_BRANCH, "main");
  });
});
