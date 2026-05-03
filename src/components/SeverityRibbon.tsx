import { useMemo } from "react";
import { useEventStore } from "../store/eventStore";
import type { UISeverity } from "../types/canopy";

const SEVERITY_RANK: Record<UISeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

const RANK_TO_SEVERITY: UISeverity[] = ["low", "medium", "high", "critical"];

const RECENT_WINDOW_MS = 10 * 60 * 1000;

/**
 * 3-color status pill driven by the worst severity seen in the last 10 minutes.
 * Picks the dominant attributed actor as a sub-label so the operator can see
 * "Threat: HIGH · Iran" without scanning the timeline.
 */
export function SeverityRibbon() {
  const uiEvents = useEventStore((s) => s.uiEvents);
  const attributions = useEventStore((s) => s.attributions);

  const { severity, actor } = useMemo(() => {
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    const recent = uiEvents.filter(
      (e) => new Date(e.timestamp).getTime() >= cutoff,
    );
    if (recent.length === 0) {
      return { severity: "low" as UISeverity, actor: null };
    }
    const maxRank = recent.reduce(
      (acc, e) => Math.max(acc, SEVERITY_RANK[e.severity] ?? 0),
      0,
    );
    const recentAttributions = attributions.filter(
      (a) => new Date(a.ts).getTime() >= cutoff,
    );
    const counts = new Map<string, number>();
    for (const a of recentAttributions) {
      if (a.actor === "Unknown" || a.actor === "Multi-actor") continue;
      counts.set(a.actor, (counts.get(a.actor) ?? 0) + 1);
    }
    let dominant: string | null = null;
    let highest = 0;
    for (const [name, n] of counts) {
      if (n > highest) {
        dominant = name;
        highest = n;
      }
    }
    return {
      severity: RANK_TO_SEVERITY[maxRank],
      actor: dominant,
    };
  }, [uiEvents, attributions]);

  return (
    <div className={`severity-ribbon sev-${severity}`}>
      <span className="severity-ribbon__dot" />
      <span className="severity-ribbon__label">Threat</span>
      <span className="severity-ribbon__value">{severity}</span>
      {actor ? (
        <span className="severity-ribbon__actor">· {actor}</span>
      ) : null}
    </div>
  );
}
