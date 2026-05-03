import { isSupabaseConfigured, supabase } from "./supabase";

/**
 * Append-only event log.
 * Every meaningful action a viewer takes is inserted as a new row in `story_events`.
 * Unlike `story_states` which overwrites, this preserves a full timeline so the owner
 * can see exactly when each viewer arrived, what they did, and what they chose.
 */

export type StoryEventType =
  | "session_started"      // login or session resume at the gate
  | "registered"           // first-time registration
  | "experience_entered"   // user clicked "play" past the title card
  | "navigation_action"    // app-level navigation such as Back/Home
  | "scene_entered"        // entered a specific scene (showcase-scene-N)
  | "choice_made"          // yes/no at the productChoice scene
  | "chapter_completed"    // reached the end of the showcase chapter
  | "heartbeat";           // periodic ping while viewing

export type LogEventInput = {
  type: StoryEventType;
  sceneId?: string;
  choiceId?: string;
  payload?: Record<string, unknown>;
  username?: string;
};

/**
 * Fire-and-forget event log.
 * Failures are silenced so a missing network never blocks the experience.
 * Returns a promise the caller can await if it cares about ordering.
 */
export async function logStoryEvent({
  type,
  sceneId,
  choiceId,
  payload = {},
  username,
}: LogEventInput): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.user) return;

    let resolvedUsername = username;
    if (!resolvedUsername) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("username")
        .eq("id", session.user.id)
        .maybeSingle();
      resolvedUsername = (profile?.username as string | undefined) ?? undefined;
    }

    const { error } = await supabase.from("story_events").insert({
      user_id: session.user.id,
      username: resolvedUsername ?? null,
      event_type: type,
      scene_id: sceneId ?? null,
      choice_id: choiceId ?? null,
      payload,
    });

    if (error) {
      console.warn("[story-events] insert failed:", error.message);
    }
  } catch (err) {
    console.warn("[story-events] logging error:", err);
  }
}
