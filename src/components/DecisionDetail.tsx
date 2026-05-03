import { useMemo } from "react";
import { useEventStore } from "../store/eventStore";
import { KBCitationCard } from "./KBCitationCard";

function findDecisionId(eventId: string): string | null {
  const m = eventId.match(/^uievt-(.+)$/);
  return m ? m[1] : null;
}

export function DecisionDetail() {
  const selectedId = useEventStore((s) => s.selectedEventId);
  const uiEvent = useEventStore((s) =>
    selectedId ? s.uiEvents.find((e) => e.id === selectedId) : null,
  );
  const decisionsById = useEventStore((s) => s.decisionsById);
  const attributionsById = useEventStore((s) => s.attributionsById);
  const close = useEventStore((s) => s.selectEvent);

  const { decision, attribution } = useMemo(() => {
    if (!uiEvent) return { decision: null, attribution: null };
    const decisionId = findDecisionId(uiEvent.id);
    const dec = decisionId ? decisionsById[decisionId] : null;
    const attrib = dec ? attributionsById[dec.attribution_id] : null;
    return { decision: dec, attribution: attrib };
  }, [uiEvent, decisionsById, attributionsById]);

  if (!uiEvent) return null;

  return (
    <div className="detail-panel">
      <div className="detail-panel__head">
        <span>
          Detail · {uiEvent.demoBeat ? `Beat ${uiEvent.demoBeat} · ` : ""}
          {uiEvent.severity.toUpperCase()}
        </span>
        <button
          type="button"
          className="detail-panel__close"
          onClick={() => close(null)}
          aria-label="Close detail"
        >
          ×
        </button>
      </div>

      <div className="detail-panel__body">
        <section className="detail-section">
          <h3>UI event</h3>
          <p style={{ color: "var(--text-primary)", fontWeight: 600 }}>
            {uiEvent.title}
          </p>
          <p>{uiEvent.message}</p>
        </section>

        {attribution ? (
          <section className="detail-section">
            <h3>Attribution</h3>
            <p>
              <strong>Actor:</strong> {attribution.actor}
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                confidence {attribution.confidence.toFixed(2)}
              </span>
            </p>
            {attribution.evidence.length > 0 ? (
              <>
                <p style={{ color: "var(--text-muted)", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", margin: "8px 0 4px" }}>
                  Evidence
                </p>
                <ul>
                  {attribution.evidence.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </>
            ) : null}
            {attribution.predicted_next ? (
              <p style={{ marginTop: 8 }}>
                <strong>Forecast:</strong> {attribution.predicted_next}
              </p>
            ) : null}
          </section>
        ) : null}

        {decision ? (
          <section className="detail-section">
            <h3>Decision</h3>
            <p>
              <strong>{decision.action.replaceAll("_", " ")}</strong>
              <span style={{ color: "var(--text-muted)", marginLeft: 8 }}>
                · authority: {decision.authority}
              </span>
            </p>
            <p>{decision.rationale}</p>
            {decision.target ? (
              <p>
                <strong>Target:</strong> {decision.target}
              </p>
            ) : null}
          </section>
        ) : null}

        {attribution && attribution.kb_citations.length > 0 ? (
          <section className="detail-section">
            <h3>KB citations</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {attribution.kb_citations.map((id) => (
                <KBCitationCard key={id} citationId={id} />
              ))}
            </div>
          </section>
        ) : null}

        {decision?.request_packet ? (
          <section className="detail-section">
            <h3>Request packet</h3>
            <pre>{JSON.stringify(decision.request_packet, null, 2)}</pre>
          </section>
        ) : null}
      </div>
    </div>
  );
}
