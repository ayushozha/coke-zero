export type Domain =
  | 'orbit'
  | 'rf_ew'
  | 'cyber'
  | 'osint'
  | 'humint'
  | 'sda'
  | 'pnt'
  | 'satcom'
  | 'drone'
  | 'terrain'

export type Realism =
  | 'real_source'
  | 'mock_operational'
  | 'synthetic_orbital_overlay'

export type UISeverity = 'low' | 'medium' | 'high' | 'critical'

export type Authority = 'local' | 'request'

export type SignalLocation = {
  label?: string
  lat?: number
  lng?: number
  alt_km?: number
  alt_m?: number
  ce_m?: number
  mgrs?: string
  area_wkt?: string
  [key: string]: unknown
}

export type SignalPayload = {
  event_type: string
  summary: string
  beat?: string
  asset?: string
  observables?: Record<string, unknown>
  [key: string]: unknown
}

export type SignalProvenance = {
  source_id: string
  citation?: string | null
  collector?: string
  method?: string
  references?: string[]
  generated_at?: string
  notes?: string
  [key: string]: unknown
}

export type Signal = {
  id: string
  ts: string
  domain: Domain
  source: string
  realism: Realism
  confidence: number
  location: SignalLocation
  payload: SignalPayload
  provenance: SignalProvenance
}

export type Anomaly = {
  id: string
  ts: string
  kind: string
  source_signal: string
  source_signal_ids: string[]
  severity: number
  payload: Record<string, unknown>
}

export type Attribution = {
  id: string
  ts: string
  anomaly_ids: string[]
  actor: string
  confidence: number
  doctrine_match: string | null
  evidence: string[]
  predicted_next: string | null
  kb_citations: string[]
  source_signal_ids: string[]
}

export type Decision = {
  id: string
  ts: string
  attribution_id: string
  action: string
  target: string
  rationale: string
  authority: Authority
  request_packet: Record<string, unknown> | null
  source_signal_ids: string[]
}

export type TraceStage =
  | 'fusion'
  | 'attrib_primary'
  | 'attrib_redteam'
  | 'attrib_reconcile'
  | 'decide'
  | 'tools'
  | 'stress'
  | 'watch'
  | 'memory'

export type TraceLevel = 'info' | 'decision' | 'tool' | 'warn'

export type ReasoningTrace = {
  id: string
  ts: string
  stage: TraceStage
  level: TraceLevel
  message: string
  ref_id: string | null
  payload: Record<string, unknown>
}

export type EmbeddingPoint = {
  signal_id: string
  summary: string
  cluster_id: number
  x: number
  y: number
  ts: string
}

export type OsintEmbeddingSnapshot = {
  id: string
  ts: string
  points: EmbeddingPoint[]
  cluster_count: number
  similarity_threshold: number
  model_name: string
  embedding_dim: number
}

export type Recommendation = {
  id: string
  summary: string
  approveLabel: string
}

export type OperatorActionStatus = 'approved' | 'denied' | 'dismissed'

export type OperatorActionPayload = {
  status: OperatorActionStatus
  subject_kind: 'ui_event' | 'recommendation' | 'decision' | 'unknown'
  actor?: string
  subject_signature?: string
  event_id?: string | null
  event_type?: UIEvent['type'] | null
  recommendation_id?: string | null
  decision_id?: string | null
  title?: string | null
  summary?: string | null
  action?: string | null
  target?: string | null
  source_signal_ids?: string[]
  note?: string | null
}

export type OperatorActionMemory = OperatorActionPayload & {
  id: string
  subject_signature: string
  actor: string
  created_at: string
  updated_at: string
}

export type MissionMemorySnapshot = {
  path: string
  warning: string | null
  counts: Record<string, number>
  state: {
    operator_actions: Record<string, OperatorActionMemory>
    [key: string]: unknown
  }
}

export type UIEvent = {
  id: string
  ts: string
  source_signal_ids: string[]
  type: 'threat_updated' | 'recommendation_created' | 'status_update'
  timestamp: string
  severity: UISeverity
  title: string
  message: string
  confidence: number
  demoBeat?: string | null
  recommendation?: Recommendation | null
}

export type CokeZeroMessage =
  | { type: 'signal'; topic?: string; data: Signal }
  | { type: 'anomaly'; topic?: string; data: Anomaly }
  | { type: 'attribution'; topic?: string; data: Attribution }
  | { type: 'decision'; topic?: string; data: Decision }
  | { type: 'ui_event'; topic?: string; data: UIEvent }
  | { type: 'operator_action'; topic?: string; data: OperatorActionMemory }
  | { type: 'trace'; topic?: string; data: ReasoningTrace }
  | { type: 'embedding'; topic?: string; data: OsintEmbeddingSnapshot }

export type CokeZeroSocketState = {
  signals: Signal[]
  anomalies: Anomaly[]
  attributions: Attribution[]
  decisions: Decision[]
  uiEvents: UIEvent[]
  traces: ReasoningTrace[]
  isConnected: boolean
  lastError: string | null
}

export type ConnectionStatus = 'connecting' | 'live' | 'fixture' | 'offline'

export type ViewMode = 'brigade' | 'operator'

export type KBEntry = {
  id: string
  actor: string
  capability_type: string
  title: string
  summary: string
  decision_implications?: string[]
  domains?: Domain[]
  scenario_signal_ids?: string[]
  [key: string]: unknown
}

export type RecommendedBurn = {
  sat?: string
  against?: string
  dv_m_s?: number
  t_burn_utc?: string
  lead_seconds?: number | null
  actual_lead_seconds?: number | null
}

export type RequestPacket = {
  recommended_burn?: RecommendedBurn
  pre_miss_km?: number
  post_miss_km?: number
  [key: string]: unknown
}

export type WSEnvelope =
  | { topic: string; kind: 'signal'; data: Signal }
  | { topic: string; kind: 'anomaly'; data: Anomaly }
  | { topic: string; kind: 'attribution'; data: Attribution }
  | { topic: string; kind: 'decision'; data: Decision }
  | { topic: string; kind: 'ui_event'; data: UIEvent }
  | { topic: string; kind: 'operator_action'; data: OperatorActionMemory }
  | { topic: string; kind: 'trace'; data: ReasoningTrace }
  | { topic: string; kind: 'embedding'; data: OsintEmbeddingSnapshot }
