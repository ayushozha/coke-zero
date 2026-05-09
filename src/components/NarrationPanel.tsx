import type { Attribution, UIEvent } from '../types/coke_zero'

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
        <h2 id="narration-title">Assessment</h2>
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
              <span>Evidence packet</span>
              <span>{Math.round(uiEvent.confidence * 100)}%</span>
            </summary>
            <dl className="narration__facts">
              <div>
                <dt>Alert type</dt>
                <dd>{uiEvent.type.replaceAll('_', ' ')}</dd>
              </div>
              <div>
                <dt>Reports behind it</dt>
                <dd>{uiEvent.source_signal_ids.length || 'none'}</dd>
              </div>
            </dl>
          </details>
        </>
      ) : attribution ? (
        <>
          <p className="narration__plain">
            coke-zero sees a pattern consistent with {attribution.actor}. It may{' '}
            {predictedNext.toLowerCase()}.
          </p>
          <details className="details-panel details-panel--nested">
            <summary>
              <span>Attribution packet</span>
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
          coke-zero is correlating multi-domain activity. No attribution package is
          ready.
        </p>
      )}
    </section>
  )
}
