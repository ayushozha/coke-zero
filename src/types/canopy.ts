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

export type Recommendation = {
  id: string
  summary: string
  approveLabel: string
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

export type CanopyMessage =
  | { type: 'signal'; topic?: string; data: Signal }
  | { type: 'anomaly'; topic?: string; data: Anomaly }
  | { type: 'attribution'; topic?: string; data: Attribution }
  | { type: 'decision'; topic?: string; data: Decision }
  | { type: 'ui_event'; topic?: string; data: UIEvent }

export type CanopySocketState = {
  signals: Signal[]
  anomalies: Anomaly[]
  attributions: Attribution[]
  decisions: Decision[]
  uiEvents: UIEvent[]
  isConnected: boolean
  lastError: string | null
}
