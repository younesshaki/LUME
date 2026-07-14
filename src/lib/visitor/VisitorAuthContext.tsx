import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type PropsWithChildren,
} from "react";
import type { Visitor, VisitorLoginInput, VisitorSignupInput } from "./types";
import { visitorClient, type VisitorClient } from "./visitorClient";
import {
  INITIAL_VISITOR_AUTH_STATE,
  visitorAuthReducer,
  type VisitorAuthActionName,
  type VisitorAuthStatus,
} from "./visitorAuthState";

type VisitorAuthContextValue = {
  status: VisitorAuthStatus;
  visitor: Visitor | null;
  pendingAction: VisitorAuthActionName;
  error: string | null;
  login: (input: VisitorLoginInput) => Promise<Visitor>;
  signup: (input: VisitorSignupInput) => Promise<Visitor>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
};

type VisitorAuthProviderProps = PropsWithChildren<{
  client?: VisitorClient;
  enabled?: boolean;
}>;

const VisitorAuthContext = createContext<VisitorAuthContextValue | null>(null);

export function VisitorAuthProvider({
  children,
  client = visitorClient,
  enabled = true,
}: VisitorAuthProviderProps) {
  if (!enabled) return <>{children}</>;
  return <ActiveVisitorAuthProvider client={client}>{children}</ActiveVisitorAuthProvider>;
}

function ActiveVisitorAuthProvider({
  children,
  client,
}: PropsWithChildren<{ client: VisitorClient }>) {
  const [state, dispatch] = useReducer(visitorAuthReducer, INITIAL_VISITOR_AUTH_STATE);

  const refresh = useCallback(async () => {
    try {
      const visitor = await client.getMe();
      dispatch(visitor
        ? { type: "check_authenticated", visitor }
        : { type: "check_anonymous" });
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error) });
    }
  }, [client]);

  useEffect(() => {
    let cancelled = false;

    void client.getMe().then(
      (visitor) => {
        if (!cancelled) {
          dispatch(visitor
            ? { type: "check_authenticated", visitor }
            : { type: "check_anonymous" });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          dispatch({ type: "failed", message: errorMessage(error) });
        }
      }
    );

    return () => {
      cancelled = true;
    };
  }, [client]);

  const login = useCallback(async (input: VisitorLoginInput) => {
    dispatch({ type: "action_started", action: "login" });
    try {
      const visitor = await client.login(input);
      dispatch({ type: "authenticated", visitor });
      return visitor;
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error) });
      throw error;
    }
  }, [client]);

  const signup = useCallback(async (input: VisitorSignupInput) => {
    dispatch({ type: "action_started", action: "signup" });
    try {
      await client.signup(input);
      const visitor = await client.login({ email: input.email, password: input.password });
      dispatch({ type: "authenticated", visitor });
      return visitor;
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error) });
      throw error;
    }
  }, [client]);

  const logout = useCallback(async () => {
    dispatch({ type: "action_started", action: "logout" });
    try {
      await client.logout();
      dispatch({ type: "logged_out" });
    } catch (error) {
      dispatch({ type: "failed", message: errorMessage(error) });
      throw error;
    }
  }, [client]);

  const clearError = useCallback(() => dispatch({ type: "clear_error" }), []);

  const value = useMemo<VisitorAuthContextValue>(
    () => ({ ...state, login, signup, logout, refresh, clearError }),
    [clearError, login, logout, refresh, signup, state]
  );

  return <VisitorAuthContext.Provider value={value}>{children}</VisitorAuthContext.Provider>;
}

export function useVisitorAuth(): VisitorAuthContextValue {
  const value = useContext(VisitorAuthContext);
  if (!value) {
    throw new Error("useVisitorAuth must be used inside VisitorAuthProvider.");
  }
  return value;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unable to update the visitor session.";
}
