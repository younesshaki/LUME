import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import "./AdminPage.css";

type Profile = {
  id: string;
  username: string;
  created_at: string;
  last_seen_at: string;
  is_admin: boolean;
};

type StoryEvent = {
  id: number;
  user_id: string;
  username: string | null;
  event_type: string;
  scene_id: string | null;
  choice_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type AdminPageProps = {
  onExit: () => void;
};

const EVENT_LABEL: Record<string, string> = {
  registered: "Registered for the first time",
  session_started: "Opened the site",
  experience_entered: "Started the experience",
  scene_entered: "Entered a scene",
  choice_made: "Made a choice",
  chapter_completed: "Finished the chapter",
  heartbeat: "Still watching",
};

const EVENT_EMOJI: Record<string, string> = {
  registered: "✨",
  session_started: "👀",
  experience_entered: "▶️",
  scene_entered: "🎬",
  choice_made: "💝",
  chapter_completed: "🏁",
  heartbeat: "💓",
};

function fmtAbsolute(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString();
}

function fmtRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.round(hr / 24);
  return `${d}d ago`;
}

function describeEvent(e: StoryEvent): string {
  const base = EVENT_LABEL[e.event_type] ?? e.event_type;
  if (e.event_type === "choice_made") {
    const choice = e.choice_id?.toUpperCase() ?? "?";
    const ms = e.payload?.responseTimeMs as number | undefined;
    const respPart = ms ? ` (responded in ${(ms / 1000).toFixed(1)}s)` : "";
    return `Answered ${choice} to productChoice${respPart}`;
  }
  if (e.event_type === "chapter_completed") {
    const ending = (e.payload?.ending as string | undefined) ?? "?";
    return `Finished the chapter (ending: ${ending})`;
  }
  if (e.event_type === "scene_entered" && e.scene_id) {
    return `Entered ${e.scene_id}`;
  }
  return base;
}

export default function AdminPage({ onExit }: AdminPageProps) {
  const [authChecked, setAuthChecked] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [adminUsername, setAdminUsername] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [events, setEvents] = useState<StoryEvent[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Authorize: must be logged in AND have is_admin = true on profile.
  // Uses the am_i_admin() SECURITY DEFINER function to avoid RLS/schema-cache pitfalls.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.user) {
          console.warn("[admin] no session");
          if (!cancelled) {
            setAuthChecked(true);
            setAuthorized(false);
          }
          return;
        }

        const { data: isAdminResult, error: rpcError } = await supabase.rpc("am_i_admin");
        if (rpcError) {
          console.warn("[admin] am_i_admin rpc error:", rpcError.message);
        }
        const isAdmin = isAdminResult === true;

        // Resolve username for the header — the user can read their own profile via
        // the existing "owner reads own profile" policy.
        const { data: profile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", session.user.id)
          .maybeSingle();

        if (cancelled) return;
        setAuthorized(isAdmin);
        setAdminUsername((profile?.username as string | null) ?? null);
        setAuthChecked(true);
      } catch (err) {
        console.warn("[admin] auth check threw:", err);
        if (!cancelled) {
          setAuthChecked(true);
          setAuthorized(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load all profiles & all events once authorized
  useEffect(() => {
    if (!authorized) return;
    setLoading(true);
    void (async () => {
      const [profilesRes, eventsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, username, created_at, last_seen_at, is_admin")
          .order("last_seen_at", { ascending: false }),
        supabase
          .from("story_events")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(500),
      ]);
      setProfiles((profilesRes.data ?? []) as Profile[]);
      setEvents((eventsRes.data ?? []) as StoryEvent[]);
      setLoading(false);
    })();
  }, [authorized]);

  // Realtime: any new story_event prepends to the list
  useEffect(() => {
    if (!authorized) return;
    const channel = supabase
      .channel("admin-events")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "story_events" },
        (payload) => {
          setEvents((prev) => [payload.new as StoryEvent, ...prev]);
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [authorized]);

  const profileById = useMemo(() => {
    const m = new Map<string, Profile>();
    profiles.forEach((p) => m.set(p.id, p));
    return m;
  }, [profiles]);

  const selectedEvents = useMemo(
    () =>
      selectedUserId
        ? events.filter((e) => e.user_id === selectedUserId)
        : events,
    [selectedUserId, events]
  );

  const stats = useMemo(() => {
    const choices = events.filter((e) => e.event_type === "choice_made");
    const yes = choices.filter((e) => e.choice_id === "yes").length;
    const no = choices.filter((e) => e.choice_id === "no").length;
    const completions = events.filter((e) => e.event_type === "chapter_completed").length;
    return { totalProfiles: profiles.length, yes, no, completions };
  }, [events, profiles]);

  if (!authChecked) {
    return (
      <div className="adminPage adminPage--loading">
        <p>Checking access...</p>
      </div>
    );
  }

  if (!authorized) {
    return (
      <div className="adminPage adminPage--denied">
        <h2>Access denied</h2>
        <p>This page is private. You need an admin account to view it.</p>
        <button type="button" className="adminPage__exitBtn" onClick={onExit}>
          Go home
        </button>
      </div>
    );
  }

  return (
    <div className="adminPage">
      <header className="adminPage__header">
        <div>
          <h1>Admin · {adminUsername ?? "owner"}</h1>
          <p className="adminPage__statsLine">
            {stats.totalProfiles} viewers · {stats.yes} yes · {stats.no} no ·{" "}
            {stats.completions} completions
          </p>
        </div>
        <button type="button" className="adminPage__exitBtn" onClick={onExit}>
          Exit
        </button>
      </header>

      <main className="adminPage__body">
        <aside className="adminPage__sidebar">
          <div className="adminPage__sidebarHeader">
            <h2>Viewers</h2>
            {selectedUserId && (
              <button
                type="button"
                className="adminPage__clearFilter"
                onClick={() => setSelectedUserId(null)}
              >
                clear filter
              </button>
            )}
          </div>
          {loading && <p className="adminPage__muted">loading…</p>}
          <ul className="adminPage__profileList">
            {profiles.map((p) => {
              const lastChoice = events.find(
                (e) => e.user_id === p.id && e.event_type === "choice_made"
              );
              const completed = events.some(
                (e) => e.user_id === p.id && e.event_type === "chapter_completed"
              );
              return (
                <li
                  key={p.id}
                  className={`adminPage__profileRow${
                    selectedUserId === p.id ? " is-selected" : ""
                  }${p.is_admin ? " is-admin" : ""}`}
                  onClick={() => setSelectedUserId(p.id)}
                >
                  <div className="adminPage__profileName">
                    {p.username}
                    {p.is_admin && <span className="adminPage__badge">admin</span>}
                  </div>
                  <div className="adminPage__profileMeta">
                    last seen {fmtRelative(p.last_seen_at)}
                    {lastChoice && (
                      <span className={`adminPage__choice adminPage__choice--${lastChoice.choice_id}`}>
                        {lastChoice.choice_id?.toUpperCase()}
                      </span>
                    )}
                    {completed && <span className="adminPage__doneFlag">✓ done</span>}
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="adminPage__timeline">
          <div className="adminPage__timelineHeader">
            <h2>
              {selectedUserId
                ? `Timeline · ${profileById.get(selectedUserId)?.username ?? "?"}`
                : "All events (latest first)"}
            </h2>
            <span className="adminPage__muted">{selectedEvents.length} events</span>
          </div>
          <ul className="adminPage__events">
            {selectedEvents.map((e) => (
              <li key={e.id} className={`adminPage__event adminPage__event--${e.event_type}`}>
                <div className="adminPage__eventLeft">
                  <span className="adminPage__eventEmoji">
                    {EVENT_EMOJI[e.event_type] ?? "•"}
                  </span>
                </div>
                <div className="adminPage__eventBody">
                  <div className="adminPage__eventDescription">
                    <strong>{e.username ?? "someone"}</strong>: {describeEvent(e)}
                  </div>
                  <div className="adminPage__eventMeta">
                    {fmtRelative(e.created_at)} · {fmtAbsolute(e.created_at)}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
    </div>
  );
}
