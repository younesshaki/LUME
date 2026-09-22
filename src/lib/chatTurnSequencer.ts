/**
 * Client-side turn sequencing for the concierge.
 *
 * The server validates and grounds every action before emitting it, but it
 * emits them *while streaming* — before the turn's final memory write. If two
 * streams for one conversation overlap, or a stream resolves after the visitor
 * has moved on, the older stream's actions are still perfectly valid responses
 * to a question that is no longer the one on screen. Applying them navigates
 * the site, refilters inventory or opens a lead form the visitor did not ask
 * for.
 *
 * The server cannot fix that on its own: by the time its compare-and-set write
 * loses the race, the bytes have already reached the browser. So the browser
 * keeps the last word on which turn may touch the page.
 *
 * This is a correctness guard layered on top of server authorization, never a
 * replacement for it. An action that fails the server's grounding checks never
 * reaches the client at all; this only decides whether an already-authorized
 * action is still *current*.
 */

/** Turn ids are opaque. UUID keeps them collision-free and unguessable. */
export function newChatRequestId(): string {
  const cryptoRef =
    typeof globalThis !== "undefined"
      ? (globalThis.crypto as Crypto | undefined)
      : undefined;
  if (cryptoRef && typeof cryptoRef.randomUUID === "function") {
    return cryptoRef.randomUUID();
  }
  // Older browsers and some test environments have no randomUUID. The id only
  // needs to be unique within one tab's session, so this is sufficient.
  const random = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${random()}${random()}-${random()}-4${random().slice(1)}-a${random().slice(1)}-${random()}${random()}${random()}`;
}

export type ChatTurnSequencer = {
  /** Make `turnId` the only turn allowed to act, superseding any previous. */
  begin(turnId: string): void;
  /**
   * Give up a turn's right to act — an abort, a reset, or an unmount. Ignored
   * if a newer turn has already taken over, so a late cleanup from an old turn
   * cannot silence the current one.
   */
  abandon(turnId: string): void;
  /** May this turn still mutate the page? */
  isAuthoritative(turnId: string): boolean;
  /** The turn currently allowed to act, for assertions and telemetry. */
  readonly activeTurnId: string | null;
};

export function createChatTurnSequencer(): ChatTurnSequencer {
  let activeTurnId: string | null = null;
  return {
    begin(turnId: string): void {
      activeTurnId = turnId;
    },
    abandon(turnId: string): void {
      if (activeTurnId === turnId) activeTurnId = null;
    },
    isAuthoritative(turnId: string): boolean {
      return activeTurnId !== null && activeTurnId === turnId;
    },
    get activeTurnId(): string | null {
      return activeTurnId;
    },
  };
}
