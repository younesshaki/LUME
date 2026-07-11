import { describe, expect, it } from "vitest";
import {
  INITIAL_VISITOR_AUTH_STATE,
  visitorAuthReducer,
  type VisitorAuthState,
} from "./visitorAuthState";

const visitor = {
  id: "visitor-1",
  email: "guest@example.com",
  firstName: "Amina",
  lastName: "Noor",
  createdAt: "2026-07-11T00:00:00.000Z",
};

describe("visitorAuthReducer", () => {
  it("moves the initial check to anonymous or authenticated", () => {
    expect(
      visitorAuthReducer(INITIAL_VISITOR_AUTH_STATE, { type: "check_anonymous" })
    ).toMatchObject({ status: "anonymous", visitor: null });

    expect(
      visitorAuthReducer(INITIAL_VISITOR_AUTH_STATE, {
        type: "check_authenticated",
        visitor,
      })
    ).toMatchObject({ status: "authenticated", visitor });
  });

  it("tracks an action and clears stale errors", () => {
    const state: VisitorAuthState = {
      status: "anonymous",
      visitor: null,
      pendingAction: null,
      error: "Old error",
    };

    expect(
      visitorAuthReducer(state, { type: "action_started", action: "login" })
    ).toEqual({ ...state, pendingAction: "login", error: null });
  });

  it("retains an authenticated visitor when logout fails", () => {
    const state: VisitorAuthState = {
      status: "authenticated",
      visitor,
      pendingAction: "logout",
      error: null,
    };

    expect(visitorAuthReducer(state, { type: "failed", message: "Try again" })).toEqual({
      status: "authenticated",
      visitor,
      pendingAction: null,
      error: "Try again",
    });
  });

  it("clears the visitor after logout", () => {
    const state: VisitorAuthState = {
      status: "authenticated",
      visitor,
      pendingAction: "logout",
      error: null,
    };

    expect(visitorAuthReducer(state, { type: "logged_out" })).toEqual({
      status: "anonymous",
      visitor: null,
      pendingAction: null,
      error: null,
    });
  });
});
