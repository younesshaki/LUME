import { describe, expect, it, vi } from "vitest";
import { recoverFromStaleDeploy, STALE_DEPLOY_RELOAD_KEY } from "./staleDeployRecovery";

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (key: string) => map.get(key) ?? null, setItem: (key: string, value: string) => void map.set(key, value) };
}

describe("recoverFromStaleDeploy", () => {
  it("reloads once when a chunk from the previous deploy is gone", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const event = { preventDefault: vi.fn() };
    expect(recoverFromStaleDeploy(event, { storage, reload, now: () => 1_000_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(storage.getItem(STALE_DEPLOY_RELOAD_KEY)).toBe("1000000");
  });

  it("does not loop: a second failure right after the reload is left alone", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    recoverFromStaleDeploy({ preventDefault: vi.fn() }, { storage, reload, now: () => 1_000_000 });
    expect(recoverFromStaleDeploy({ preventDefault: vi.fn() }, { storage, reload, now: () => 1_030_000 })).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("recovers again after a later deploy", () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    recoverFromStaleDeploy({ preventDefault: vi.fn() }, { storage, reload, now: () => 1_000_000 });
    expect(recoverFromStaleDeploy({ preventDefault: vi.fn() }, { storage, reload, now: () => 1_000_000 + 120_000 })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("still reloads when storage is unavailable", () => {
    const reload = vi.fn();
    expect(recoverFromStaleDeploy({ preventDefault: vi.fn() }, { storage: null, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
