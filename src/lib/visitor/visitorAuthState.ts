import type { Visitor } from "./types";

export type VisitorAuthStatus = "loading" | "anonymous" | "authenticated";
export type VisitorAuthActionName = "login" | "signup" | "logout" | null;

export type VisitorAuthState = {
  status: VisitorAuthStatus;
  visitor: Visitor | null;
  pendingAction: VisitorAuthActionName;
  error: string | null;
};

export type VisitorAuthAction =
  | { type: "check_authenticated"; visitor: Visitor }
  | { type: "check_anonymous" }
  | { type: "action_started"; action: Exclude<VisitorAuthActionName, null> }
  | { type: "authenticated"; visitor: Visitor }
  | { type: "logged_out" }
  | { type: "failed"; message: string }
  | { type: "clear_error" };

export const INITIAL_VISITOR_AUTH_STATE: VisitorAuthState = {
  status: "loading",
  visitor: null,
  pendingAction: null,
  error: null,
};

export function visitorAuthReducer(
  state: VisitorAuthState,
  action: VisitorAuthAction
): VisitorAuthState {
  switch (action.type) {
    case "check_authenticated":
    case "authenticated":
      return {
        status: "authenticated",
        visitor: action.visitor,
        pendingAction: null,
        error: null,
      };
    case "check_anonymous":
    case "logged_out":
      return {
        status: "anonymous",
        visitor: null,
        pendingAction: null,
        error: null,
      };
    case "action_started":
      return { ...state, pendingAction: action.action, error: null };
    case "failed":
      return {
        ...state,
        status: state.visitor ? "authenticated" : "anonymous",
        pendingAction: null,
        error: action.message,
      };
    case "clear_error":
      return { ...state, error: null };
  }
}
