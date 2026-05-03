import type { Attribution, UIEvent } from '../types/canopy'

type NarrationPanelProps = {
  attribution: Attribution | null
  uiEvent?: UIEvent | null
}

export function NarrationPanel({
  attribution,
  uiEvent = null,
}: NarrationPanelProps) {
  const predictedNext =
    attribution?.predicted_next ?? 'continued activity in the next window'

  return (
    <section className="narration" aria-labelledby="narration-title">
      <div className="panel__header">
        <h2 id="narration-title">Commander Narration</h2>
        <span>
          {uiEvent
            ? uiEvent.severity
            : attribution
              ? 'attribution lock'
              : 'standing by'}
        </span>
      </div>

      {uiEvent ? (
        <>
          <p className="narration__plain">{uiEvent.message}</p>
          <details className="details-panel details-panel--nested">
            <summary>
              <span>Event Detail</span>
              <span>{Math.round(uiEvent.confidence * 100)}%</span>
            </summary>
            <dl className="narration__facts">
              <div>
                <dt>Type</dt>
                <dd>{uiEvent.type}</dd>
              </div>
              <div>
                <dt>Signals</dt>
                <dd>{uiEvent.source_signal_ids.join(', ') || 'none'}</dd>
              </div>
            </dl>
          </details>
        </>
      ) : attribution ? (
        <>
          <p className="narration__plain">
            CANOPY assesses {attribution.actor} is preparing to{' '}
            {predictedNext.toLowerCase()}.
          </p>
          <details className="details-panel details-panel--nested">
            <summary>
              <span>Attribution Detail</span>
              <span>{Math.round(attribution.confidence * 100)}%</span>
            </summary>
            <dl className="narration__facts">
              <div>
                <dt>Doctrine</dt>
                <dd>{attribution.doctrine_match}</dd>
              </div>
              <div>
                <dt>Citations</dt>
                <dd>{attribution.kb_citations.join(', ')}</dd>
              </div>
            </dl>
            <ul className="narration__evidence">
              {attribution.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </details>
        </>
      ) : (
        <p className="narration__plain">
          CANOPY is correlating multi-domain activity. No attribution package is
          ready.
        </p>
      )}
    </section>
  )
}
