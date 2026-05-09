import { defaultScenario } from '../data/scenarioLibrary'
import type {
  Anomaly,
  Attribution,
  CokeZeroMessage,
  Decision,
  OsintEmbeddingSnapshot,
  ReasoningTrace,
  Signal,
  UIEvent,
} from '../types/coke_zero'

let sessionCounter = 0

const isoAt = (startMs: number, seconds: number) =>
  new Date(startMs + seconds * 1000).toISOString()

const withLiveTime = (signal: Signal, startMs: number, seconds: number): Signal => ({
  ...signal,
  ts: isoAt(startMs, seconds),
})

function toolTrace(
  id: string,
  ts: string,
  message: string,
  tool: string,
  args: Record<string, unknown>,
  result: Record<string, unknown>,
): ReasoningTrace {
  return {
    id,
    ts,
    stage: 'tools',
    level: 'tool',
    message,
    ref_id: null,
    payload: { tool, args, result },
  }
}

export function createStaticDemoMessages(): CokeZeroMessage[] {
  sessionCounter += 1
  const sessionId = `static-${sessionCounter}`
  const startMs = Date.now()
  const scenario = defaultScenario
  const signals = scenario.signals
    .slice(0, Math.min(7, scenario.signals.length))
    .map((signal, index) => withLiveTime(signal, startMs, 4 + index * 2))
  const signalIds = signals.map((signal) => signal.id)
  const primaryIds = signalIds.slice(0, Math.min(5, signalIds.length))
  const now = (seconds: number) => isoAt(startMs, seconds)

  const anomaly: Anomaly = {
    id: `${sessionId}-anomaly-counter-c5isr`,
    ts: now(16),
    kind: 'cross_domain_counter_c5isr',
    source_signal: primaryIds[0] ?? 'static-signal',
    source_signal_ids: primaryIds,
    severity: 0.88,
    payload: {
      scenario: scenario.file,
      summary:
        'SDA custody shift, RF/EW pressure, PNT drift, and cyber probing converged inside one brigade decision window.',
    },
  }

  const attribution: Attribution = {
    id: `${sessionId}-attrib-irgc-c5isr`,
    ts: now(22),
    anomaly_ids: [anomaly.id],
    actor: 'IRGC-aligned counter-C5ISR cell',
    confidence: 0.86,
    doctrine_match:
      'multi-domain isolation of brigade command links before a fires window',
    evidence: [
      'RF/EW reports align with the same BLOS relay affected by SATCOM degradation.',
      'Cyber probing and PNT drift are time-correlated with the SDA custody change.',
      'Nia-indexed scenario context matches the counter-C5ISR playbook.',
    ],
    predicted_next: 'open a short BLOS denial window while ISR custody degrades',
    kb_citations: ['iran:gnss_jamming_regional', 'iran:irgc_cyber'],
    source_signal_ids: primaryIds,
  }

  const decision: Decision = {
    id: `${sessionId}-decision-space-link`,
    ts: now(30),
    attribution_id: attribution.id,
    action: 'space_link_interdiction_request',
    target: 'SATCOM relay and brigade north-axis BLOS window',
    rationale:
      'Request-authority routing preserves command links by shifting SATCOM posture and tasking space support before the predicted denial window.',
    authority: 'request',
    request_packet: {
      packet_id: `REQ-${sessionId.toUpperCase()}`,
      to: 'CJFSCC / higher-authority space effects cell',
      commander_intent: 'preserve brigade C2 and ISR custody',
      ttl_minutes: 6,
      recommended_burn: {
        sat: 'USA 314',
        against: 'COSMOS 2576',
        dv_m_s: 1.8,
        lead_seconds: 420,
      },
      pre_miss_km: 8.4,
      post_miss_km: 92.7,
    },
    source_signal_ids: primaryIds,
  }

  const threatEvent: UIEvent = {
    id: `${sessionId}-ui-threat`,
    ts: now(24),
    timestamp: now(24),
    source_signal_ids: primaryIds,
    type: 'threat_updated',
    severity: 'high',
    title: 'Counter-C5ISR campaign assessed',
    message:
      'coke-zero correlates space, RF/EW, PNT, cyber, and SATCOM pressure against the brigade C2 window.',
    confidence: 0.86,
    demoBeat: 'deployed',
  }

  const recommendationEvent: UIEvent = {
    id: `${sessionId}-ui-recommendation`,
    ts: now(32),
    timestamp: now(32),
    source_signal_ids: primaryIds,
    type: 'recommendation_created',
    severity: 'high',
    title: 'Request higher-authority space-link action',
    message:
      'Recommend routing an approval packet to preserve BLOS command links before the predicted denial window.',
    confidence: 0.87,
    demoBeat: 'deployed',
    recommendation: {
      id: `${sessionId}-rec-space-link`,
      summary: 'Approve request packet for space-link interdiction and SATCOM hardening.',
      approveLabel: 'Approve',
    },
  }

  const traces: ReasoningTrace[] = [
    {
      id: `${sessionId}-trace-watch`,
      ts: now(1),
      stage: 'watch',
      level: 'info',
      message:
        '[watch] Tensorlake-compatible mission watch cycle replayed the deployed static scenario.',
      ref_id: scenario.file,
      payload: {
        execution: 'tensorlake_compatible_worker',
        mode: 'static_deploy',
        run_id: sessionId,
        scenario: scenario.file,
      },
    },
    {
      id: `${sessionId}-trace-memory`,
      ts: now(2),
      stage: 'memory',
      level: 'info',
      message:
        '[memory] durable mission memory path is shown in UI; static deploy keeps operator actions in session storage.',
      ref_id: null,
      payload: { backend_required: false },
    },
    {
      id: `${sessionId}-trace-fusion`,
      ts: now(18),
      stage: 'fusion',
      level: 'info',
      message:
        'fused multi-domain reports into one counter-C5ISR anomaly cluster.',
      ref_id: anomaly.id,
      payload: { signal_count: primaryIds.length, anomaly_id: anomaly.id },
    },
    {
      id: `${sessionId}-trace-nia`,
      ts: now(20),
      stage: 'attrib_primary',
      level: 'info',
      message:
        'nia.context -> 3 indexed source hit(s): scenario, KB capability note, Tensorlake execution proof.',
      ref_id: attribution.id,
      payload: {
        citations: [
          'scenarios/iran_counter_c5isr_brigade.jsonl',
          'kb/entries/iran/gnss_jamming_regional.yaml',
          'docs/tensorlake_execution_proof.md',
        ],
      },
    },
    {
      id: `${sessionId}-trace-redteam`,
      ts: now(21),
      stage: 'attrib_redteam',
      level: 'warn',
      message:
        'red-team challenge checked single-domain outage explanations and found cross-domain timing stronger.',
      ref_id: attribution.id,
      payload: { alternate: 'localized SATCOM fault' },
    },
    {
      id: `${sessionId}-trace-reconcile`,
      ts: now(23),
      stage: 'attrib_reconcile',
      level: 'decision',
      message:
        'reconciled attribution to IRGC-aligned counter-C5ISR with request-authority confidence.',
      ref_id: attribution.id,
      payload: { confidence: attribution.confidence },
    },
    toolTrace(
      `${sessionId}-trace-kb`,
      now(26),
      'kb.lookup matched regional GNSS jamming and IRGC cyber tradecraft.',
      'kb.lookup',
      {
        actor: attribution.actor,
        capability_type: 'counter_c5isr',
        scenario_signal_id: primaryIds[0],
      },
      { count: 2 },
    ),
    toolTrace(
      `${sessionId}-trace-close`,
      now(27),
      'orbit.compute_close_approach found a narrow support window.',
      'orbit.compute_close_approach',
      { sat_a: 'USA 314', sat_b: 'COSMOS 2576' },
      { closest_approach_km: 8.4, t_closest: now(420) },
    ),
    toolTrace(
      `${sessionId}-trace-request`,
      now(29),
      'request.draft built a higher-authority packet.',
      'request.draft',
      { actor: attribution.actor, confidence: attribution.confidence },
      { request_packet: { to: 'CJFSCC', ttl_minutes: 6 } },
    ),
    {
      id: `${sessionId}-trace-decide`,
      ts: now(31),
      stage: 'decide',
      level: 'decision',
      message:
        'decision routed to request authority with SATCOM hardening and space-link interdiction packet.',
      ref_id: decision.id,
      payload: { decision_id: decision.id, authority: decision.authority },
    },
  ]

  const osintSignals = signals.filter((signal) => signal.domain === 'osint')
  const embeddingSignals = (osintSignals.length ? osintSignals : signals).slice(0, 5)
  const embedding: OsintEmbeddingSnapshot = {
    id: `${sessionId}-embedding`,
    ts: now(28),
    cluster_count: 2,
    similarity_threshold: 0.4,
    model_name: 'static-deploy-fixture/all-MiniLM-L6-v2',
    embedding_dim: 384,
    points: embeddingSignals.map((signal, index) => ({
      signal_id: signal.id,
      summary: signal.payload.summary,
      cluster_id: index < 3 ? 0 : 1,
      x: index * 0.42 - 0.5,
      y: (index % 2 === 0 ? 0.24 : -0.18) + index * 0.08,
      ts: signal.ts,
    })),
  }

  return [
    ...traces.slice(0, 2).map((trace) => ({ type: 'trace', data: trace }) as const),
    ...signals.map((signal) => ({ type: 'signal', data: signal }) as const),
    { type: 'trace', data: traces[2] },
    { type: 'anomaly', data: anomaly },
    ...traces.slice(3, 6).map((trace) => ({ type: 'trace', data: trace }) as const),
    { type: 'attribution', data: attribution },
    ...traces.slice(6, 9).map((trace) => ({ type: 'trace', data: trace }) as const),
    { type: 'embedding', data: embedding },
    { type: 'decision', data: decision },
    { type: 'ui_event', data: threatEvent },
    { type: 'trace', data: traces[9] },
    { type: 'ui_event', data: recommendationEvent },
  ]
}
