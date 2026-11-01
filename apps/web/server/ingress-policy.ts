/** Explicit public API families; route handlers retain tenant/origin/path checks. */
export function ingressPolicy(path: string) {
  const vehicles = /^\/api\/vehicles(?:\/|$)/.test(path);
  const mutation = ["/api/leads", "/api/consent", "/api/chat"].includes(path);
  const visitor = /^\/api\/visitor(?:\/|$)/.test(path);
  return {
    publicApi: vehicles || mutation || visitor,
    methods: [
      "GET",
      "HEAD",
      ...(vehicles ? ["OPTIONS"] : []),
      ...(mutation || visitor ? ["POST", "OPTIONS"] : []),
      ...(visitor ? ["DELETE"] : []),
    ],
  };
}
