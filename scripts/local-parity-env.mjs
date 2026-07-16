const REDACTED_PULL_OVERRIDES = new Set([
  "SUPABASE_SERVICE_ROLE_KEY",
]);

/**
 * Vercel writes an empty placeholder for Sensitive values during `env pull`.
 * Preserve an explicitly supplied local staging secret for that narrow case,
 * while keeping every non-empty branch-scoped value authoritative.
 */
export function mergeParityRuntimeEnvironment(localEnvironment, pulledEnvironment) {
  const merged = { ...localEnvironment, ...pulledEnvironment };

  for (const key of REDACTED_PULL_OVERRIDES) {
    const pulledValue = pulledEnvironment[key];
    const localValue = localEnvironment[key];
    if (!pulledValue?.trim() && localValue?.trim()) {
      merged[key] = localValue;
    }
  }

  return merged;
}
