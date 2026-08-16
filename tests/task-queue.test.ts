import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTaskQueue } from "../packages/plugins/src/task-queue";

/** A task that reports when it starts and finishes, and resolves when told to. */
function controllable(log: string[], label: string) {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const task = async () => {
    log.push(`${label}:start`);
    await gate;
    log.push(`${label}:end`);
    return label;
  };
  return { task, release };
}

describe("createTaskQueue", () => {
  it("holds a task until the one before it has finished", async () => {
    const run = createTaskQueue();
    const log: string[] = [];
    const first = controllable(log, "first");
    const second = controllable(log, "second");

    const firstDone = run(first.task);
    const secondDone = run(second.task);
    // Both were queued before either finished; the second must not have begun.
    await Promise.resolve();
    assert.deepEqual(log, ["first:start"]);

    first.release();
    await firstDone;
    second.release();
    await secondDone;

    assert.deepEqual(log, ["first:start", "first:end", "second:start", "second:end"]);
  });

  it("returns each task's own result to its own caller", async () => {
    const run = createTaskQueue();

    assert.deepEqual(await Promise.all([run(async () => "a"), run(async () => "b")]), ["a", "b"]);
  });

  it("keeps running after a task throws, and rejects only that caller", async () => {
    const run = createTaskQueue();
    const failed = run(async () => {
      throw new Error("archive unreachable");
    });

    await assert.rejects(failed, /archive unreachable/);
    assert.equal(await run(async () => "after"), "after");
  });
});
