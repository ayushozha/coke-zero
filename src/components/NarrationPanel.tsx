import type { Attribution } from '../types/canopy'

type NarrationPanelProps = {
  attribution: Attribution | null
}

export function NarrationPanel({ attribution }: NarrationPanelProps) {
  return (
    <section className="narration" aria-labelledby="narration-title">
      <div className="panel__header">
        <h2 id="narration-title">Commander Narration</h2>
        <span>{attribution ? 'attribution lock' : 'standing by'}</span>
      </div>

      {attribution ? (
        <>
          <p className="narration__plain">
            CANOPY assesses {attribution.actor} is preparing to{' '}
            {attribution.predicted_next.toLowerCase()}.
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
