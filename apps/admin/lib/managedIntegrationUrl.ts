/**
 * Client-safe URL hygiene shared by managed feed and syndication surfaces.
 * Query-string credentials are never a supported configuration mechanism:
 * they leak through browser history, screenshots, logs, and operational UI.
 */
export const SENSITIVE_MANAGED_INTEGRATION_QUERY_KEY =
  /(?:authorization|secret|token|password|api[_-]?key|access[_-]?key|credential|signature|(?:^|[_-])sig(?:$|[_-])|(?:^|[_-])auth(?:$|[_-]))/i;

export function isSensitiveManagedIntegrationQueryKey(value: string): boolean {
  return SENSITIVE_MANAGED_INTEGRATION_QUERY_KEY.test(value);
}
