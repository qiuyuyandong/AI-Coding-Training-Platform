import type { CaptureEvent } from "@/lib/capture/protocol";
import {
  canonicalProblemUrl,
  normalizeProblemIdentity,
} from "@/lib/services/canonicalProblemUrl";

/**
 * Re-apply server-side normalization to a V2 capture event:
 *
 *   1. canonicalize the problem identity so platform/externalId variants are
 *      deduplicated against existing rows;
 *   2. canonicalize the URL so cross-platform case and tracking queries do
 *      not produce different identities.
 *
 * This is a deliberate subset of the existing ingest path; the same
 * normalization runs on both `/api/capture/events` and the new atomic
 * `/api/capture/attempts` route so a bundle and a stream of single events
 * project to the same row identities.
 */
export function normalizeCaptureEvent<E extends CaptureEvent>(event: E): E {
  const identity = normalizeProblemIdentity({
    platform: event.platform,
    externalId: event.problemExternalId,
  });
  return {
    ...event,
    problemExternalId: identity.externalId,
    canonicalUrl: canonicalProblemUrl(identity, event.canonicalUrl),
  };
}
