"use server";

import type { ConciergeTargetConfig } from "@lume/types";
import {
  resetOrDeleteConciergeTarget,
  saveConciergeTarget,
} from "@/lib/conciergeTargets.server";

export async function saveConciergeTargetAction(
  slug: string,
  target: Partial<ConciergeTargetConfig>,
  originalKey: string | null,
) {
  return saveConciergeTarget(slug, target, originalKey);
}

export async function resetConciergeTargetAction(slug: string, key: string) {
  return resetOrDeleteConciergeTarget(slug, key);
}
