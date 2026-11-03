"use client";
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type { StoryStore } from "./story-store";

const Context = createContext<StoryStore | null>(null);
/** Install explicitly in BOTH the DOM root and the separately-created R3F root.
 * Passing the same tenant-local store is the bridge; React context does not
 * cross createRoot() by itself. No singleton / cross-tenant state.
 */
export function StoryProvider({
  store,
  children,
}: {
  store: StoryStore;
  children: ReactNode;
}) {
  return <Context.Provider value={store}>{children}</Context.Provider>;
}
export function useStoryStore() {
  const store = useContext(Context);
  if (!store) throw new Error("Missing showcase story bridge");
  return store;
}
export function useStory() {
  const store = useStoryStore();
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
