import type { AppRouteId } from "@/app-shell/routeIds";

export type ComparePanelState = {
  active: boolean;
  itemCount: number;
};

export type FilterDrawerState = {
  open: boolean;
  side: "left" | "right";
};

export type ChatState = {
  open: boolean;
  busy: boolean;
};

export type DockState = {
  hovered: boolean;
  adapted: boolean;
};

export type HeaderState = {
  mobileMenuOpen: boolean;
};

export type ModelViewerState = {
  active: boolean;
  modelSrc: string | null;
};

export type UIStateSnapshot = {
  comparePanel: ComparePanelState;
  filterDrawer: FilterDrawerState;
  chat: ChatState;
  dock: DockState;
  header: HeaderState;
  modelViewer: ModelViewerState;
  activeRoute: AppRouteId | null;
};

export const DEFAULT_UI_STATE: UIStateSnapshot = {
  comparePanel: { active: false, itemCount: 0 },
  filterDrawer: { open: false, side: "left" },
  chat: { open: false, busy: false },
  dock: { hovered: false, adapted: false },
  header: { mobileMenuOpen: false },
  modelViewer: { active: false, modelSrc: null },
  activeRoute: null,
};
