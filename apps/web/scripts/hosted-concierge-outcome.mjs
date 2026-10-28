/** Classify observed wire evidence, without treating unrelated failures as balance errors. */
export function inspectHostedChat({
  status,
  contentType,
  body,
  expectUnfunded = false,
}) {
  const events = [];
  let malformedFrames = 0;
  const timingRoutes = [];
  if (/text\/event-stream/i.test(contentType))
    for (const line of body.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const value = line.slice(6).trim();
      if (value === "[DONE]") {
        events.push("[DONE]");
        continue;
      }
      try {
        const data = JSON.parse(value);
        if (data.type === "timing" && typeof data.timing?.route === "string")
          timingRoutes.push(data.timing.route);
        events.push(
          data.type ?? (data.choices?.[0]?.delta?.content ? "delta" : "other"),
        );
      } catch {
        malformedFrames++;
      }
    }
  let payload;
  if (/application\/json/i.test(contentType))
    try {
      payload = JSON.parse(body);
    } catch {
      /* not a valid error contract */
    }
  const explicitBalance =
    /insufficient[ _-]*balance|insufficient.{0,30}balance|balance.{0,30}insufficient/i.test(
      body,
    );
  // Admin deliberately maps a failed provider HTTP status (including 402) to
  // this sanitized 502. Its response does not prove the exact provider cause.
  const sanitizedProviderFailure =
    status === 502 && payload?.error === "AI provider request failed";
  const expectedError =
    expectUnfunded &&
    ((explicitBalance &&
      (status === 402 ||
        status === 502 ||
        (status === 200 && events.includes("error")))) ||
      sanitizedProviderFailure);
  const completeSse =
    status === 200 &&
    events[0] === "meta" &&
    events.includes("delta") &&
    events.at(-1) === "[DONE]" &&
    !events.includes("error") &&
    malformedFrames === 0;
  return {
    classification: expectedError
      ? "expected-unfunded-provider-error"
      : completeSse
        ? "complete-sse"
        : "unexpected-response",
    accepted: expectedError || completeSse,
    events,
    malformedFrames,
    completeSse,
    actionFrameObserved: events.includes("action"),
    balanceReasonExplicit: explicitBalance,
    timingRoutes,
    providerRouteObserved: timingRoutes.some((route) =>
      ["model", "tool"].includes(route),
    ),
    providerReasonSanitized: sanitizedProviderFailure,
    fundedAnswer: expectUnfunded
      ? "pending funding"
      : completeSse &&
          timingRoutes.some((route) => ["model", "tool"].includes(route))
        ? "proven"
        : "not proven; SSE alone may be deterministic",
  };
}
