import { isSupabaseConfigured, supabase } from "./supabase";
import { logStoryEvent } from "./eventsService";

export type AuthUser = {
  userId: string;
  username: string;
};

export type AuthResult =
  | { success: true; user: AuthUser; isNew: boolean }
  | {
      success: false;
      error:
        | "wrong_password"
        | "username_taken"
        | "network_error"
        | "invalid_username";
    };

export function sanitizeUsername(input: string): string | null {
  const lower = input.trim().toLowerCase();
  if (!/^[a-z0-9_]{2,30}$/.test(lower)) return null;
  return lower;
}

function toEmail(username: string): string {
  return `${username}@lume-users.com`;
}

const LOCAL_AUTH_KEY = "lume.preview-auth.v1";
let existingSessionRequest: Promise<AuthUser | null> | null = null;

/** Collapse concurrent provider/StrictMode session checks into one request. */
export function checkExistingSession(): Promise<AuthUser | null> {
  if (existingSessionRequest) return existingSessionRequest;
  const request = lookupExistingSession();
  existingSessionRequest = request;
  const clear = () => {
    if (existingSessionRequest === request) existingSessionRequest = null;
  };
  void request.then(clear, clear);
  return request;
}

async function lookupExistingSession(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured && typeof window !== "undefined") {
    const username = window.localStorage.getItem(LOCAL_AUTH_KEY);
    return username ? { userId: "local-preview", username } : null;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) return null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", session.user.id)
      .maybeSingle();

    if (!profile?.username) return null;

    return { userId: session.user.id, username: profile.username as string };
  } catch {
    return null;
  }
}

export async function loginOrRegister(
  rawUsername: string,
  password: string
): Promise<AuthResult> {
  const username = sanitizeUsername(rawUsername);
  if (!username) return { success: false, error: "invalid_username" };

  if (!isSupabaseConfigured) {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(LOCAL_AUTH_KEY, username);
    }
    return {
      success: true,
      user: { userId: "local-preview", username },
      isNew: false,
    };
  }

  const email = toEmail(username);

  try {
    // Try sign in first
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({ email, password });

    if (signInData.session) {
      // last_seen_at is updated server-side by the update_last_seen_trigger
      // whenever a session_started event is inserted — see migration 008.
      void logStoryEvent({
        type: "session_started",
        username,
        payload: { isNew: false },
      });

      return {
        success: true,
        user: { userId: signInData.user!.id, username },
        isNew: false,
      };
    }

    const isWrongCreds =
      signInError?.message?.toLowerCase().includes("invalid login credentials") ||
      signInError?.message?.toLowerCase().includes("invalid credentials") ||
      signInError?.status === 400 ||
      signInError?.status === 422;

    if (!isWrongCreds) {
      return { success: false, error: "network_error" };
    }

    // Check if the username already exists, via a SECURITY DEFINER RPC that bypasses
    // the profiles RLS policy (which would otherwise hide it from anon callers).
    // This is the critical fix: previously, anon couldn't see existing profiles,
    // so the code thought every existing username was new and tried to signUp,
    // which returned an obfuscated fake user → profile insert failed with 23505 →
    // "username_taken" — making it impossible for existing users to log back in.
    const { data: usernameTaken, error: rpcError } = await supabase.rpc(
      "username_exists",
      { p_username: username }
    );

    if (rpcError) {
      return { success: false, error: "network_error" };
    }

    if (usernameTaken === true) {
      // Username belongs to an existing account but the password didn't match
      return { success: false, error: "wrong_password" };
    }

    // New username — register
    const { data: signUpData, error: signUpError } =
      await supabase.auth.signUp({ email, password });

    if (signUpError || !signUpData.user) {
      return { success: false, error: "network_error" };
    }

    // Insert profile row
    const { error: profileError } = await supabase
      .from("profiles")
      .insert({ id: signUpData.user.id, username });

    if (profileError) {
      // Race condition: another user grabbed the same username just now
      if (profileError.code === "23505") {
        return { success: false, error: "username_taken" };
      }
      return { success: false, error: "network_error" };
    }

    void logStoryEvent({
      type: "registered",
      username,
      payload: { isNew: true },
    });
    void logStoryEvent({
      type: "session_started",
      username,
      payload: { isNew: true },
    });

    return {
      success: true,
      user: { userId: signUpData.user.id, username },
      isNew: true,
    };
  } catch {
    return { success: false, error: "network_error" };
  }
}

export async function logout(): Promise<void> {
  if (!isSupabaseConfigured && typeof window !== "undefined") {
    window.localStorage.removeItem(LOCAL_AUTH_KEY);
    return;
  }

  await supabase.auth.signOut();
}
