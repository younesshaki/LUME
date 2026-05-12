import { create } from "zustand";
import { devtools } from "zustand/middleware";
import type { AppRouteId } from "@/app-shell/routeIds";
import {
  DEFAULT_UI_STATE,
  type ChatState,
  type ComparePanelState,
  type DockState,
  type FilterDrawerState,
  type HeaderState,
  type ModelViewerState,
  type UIStateSnapshot,
} from "./uiStateTypes";

type UIStoreActions = {
  setComparePanel: (comparePanel: ComparePanelState) => void;
  setFilterDrawer: (filterDrawer: FilterDrawerState) => void;
  setChat: (chat: Partial<ChatState>) => void;
  setDock: (dock: Partial<DockState>) => void;
  setHeader: (header: Partial<HeaderState>) => void;
  setModelViewer: (modelViewer: ModelViewerState) => void;
  setActiveRoute: (activeRoute: AppRouteId | null) => void;
  resetTransientUI: () => void;
};

export type UIStore = UIStateSnapshot & UIStoreActions;

export const useUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      ...DEFAULT_UI_STATE,
      setComparePanel: (comparePanel) =>
        set({ comparePanel }, false, "ui/setComparePanel"),
      setFilterDrawer: (filterDrawer) =>
        set({ filterDrawer }, false, "ui/setFilterDrawer"),
      setChat: (chat) =>
        set((state) => ({ chat: { ...state.chat, ...chat } }), false, "ui/setChat"),
      setDock: (dock) =>
        set((state) => ({ dock: { ...state.dock, ...dock } }), false, "ui/setDock"),
      setHeader: (header) =>
        set((state) => ({ header: { ...state.header, ...header } }), false, "ui/setHeader"),
      setModelViewer: (modelViewer) =>
        set({ modelViewer }, false, "ui/setModelViewer"),
      setActiveRoute: (activeRoute) =>
        set({ activeRoute }, false, "ui/setActiveRoute"),
      resetTransientUI: () =>
        set(
          {
            comparePanel: DEFAULT_UI_STATE.comparePanel,
            filterDrawer: DEFAULT_UI_STATE.filterDrawer,
            chat: DEFAULT_UI_STATE.chat,
            dock: DEFAULT_UI_STATE.dock,
            header: DEFAULT_UI_STATE.header,
            modelViewer: DEFAULT_UI_STATE.modelViewer,
          },
          false,
          "ui/resetTransientUI"
        ),
    }),
    { name: "LUME UIState" }
  )
);

export function getUIStateSnapshot(): UIStateSnapshot {
  const {
    comparePanel,
    filterDrawer,
    chat,
    dock,
    header,
    modelViewer,
    activeRoute,
  } = useUIStore.getState();

  return {
    comparePanel,
    filterDrawer,
    chat,
    dock,
    header,
    modelViewer,
    activeRoute,
  };
}
