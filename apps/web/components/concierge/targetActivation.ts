import { publicPath } from "./publicPath";

export type TargetActivation = {
  path: string;
  handlerId: string;
  kind: "form" | "modal";
};
const KEY = "lume.web.pending-target.v1";
const EVENT = "lume:concierge-target";
type Pending = TargetActivation & { tenant: string; expires: number };
let memory: Pending | null = null;

export function queueTargetActivation(
  tenant: string,
  target: TargetActivation,
) {
  memory = { ...target, tenant, expires: Date.now() + 300000 };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* tab fallback */
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Registered IDs only: never a model-authored selector or arbitrary script. */
export function watchTargetActivation(): () => void {
  let observer: MutationObserver | null = null;
  function activate() {
    let pending = memory;
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) pending = JSON.parse(raw);
    } catch {
      /* tab fallback */
    }
    if (!pending) return;
    const clear = () => {
      memory = null;
      observer?.disconnect();
      try {
        sessionStorage.removeItem(KEY);
      } catch {
        /* cleared */
      }
    };
    if (
      typeof pending.path !== "string" ||
      publicPath(pending.path) !== pending.path ||
      typeof pending.handlerId !== "string" ||
      !/^[A-Za-z][\w:.-]*$/.test(pending.handlerId) ||
      !["form", "modal"].includes(pending.kind) ||
      typeof pending.expires !== "number" ||
      pending.expires < Date.now()
    ) {
      clear();
      return;
    }
    if (
      pending.path !== location.pathname ||
      new URLSearchParams(location.search).get("tenant") !== pending.tenant
    )
      return;
    const node = document.getElementById(pending.handlerId);
    if (!node) {
      if (!observer) {
        observer = new MutationObserver(activate);
        observer.observe(document.body, { childList: true, subtree: true });
      }
      return;
    }
    if (pending.kind === "modal") {
      if (!(node instanceof HTMLDialogElement)) return;
      if (!node.open) node.showModal();
    }
    node.scrollIntoView({ block: "center", behavior: "instant" });
    node
      .querySelector<HTMLElement>(
        "input:not([disabled]),textarea:not([disabled]),select:not([disabled]),button:not([disabled])",
      )
      ?.focus({ preventScroll: true });
    clear();
  }
  activate();
  window.addEventListener(EVENT, activate);
  return () => {
    observer?.disconnect();
    window.removeEventListener(EVENT, activate);
  };
}
