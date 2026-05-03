import type { Domain, Signal, UIEvent } from '../types/canopy'

const domainCopy: Record<
  Domain,
  { label: string; meaning: string; commanderQuestion: string }
> = {
  orbit: {
    label: 'Satellite proximity',
    meaning: 'A satellite or nearby object may affect friendly space support.',
    commanderQuestion: 'Could this disrupt ISR, warning, or communications?',
  },
  sda: {
    label: 'Space tracking',
    meaning: 'Space tracking or overhead warning changed.',
    commanderQuestion: 'Does the brigade need space support attention?',
  },
  rf_ew: {
    label: 'Radio interference',
    meaning: 'Enemy jamming or interference may be affecting links.',
    commanderQuestion: 'Are radios, drones, or SATCOM starting to degrade?',
  },
  cyber: {
    label: 'Cyber access probe',
    meaning: 'A command, fires, or space-support system is being probed.',
    commanderQuestion: 'Should automated handoffs be slowed or checked?',
  },
  osint: {
    label: 'Intel context',
    meaning: 'Open or correlated reporting changed the threat picture.',
    commanderQuestion: 'Does this change the commander’s risk estimate?',
  },
  humint: {
    label: 'Human report',
    meaning: 'A human-source report adds collection or targeting context.',
    commanderQuestion: 'Does this support a pause, mask, or emit less order?',
  },
  pnt: {
    label: 'GPS / timing warning',
    meaning: 'Position, navigation, or timing may not be trustworthy.',
    commanderQuestion: 'Can we trust coordinates for movement or fires?',
  },
  satcom: {
    label: 'SATCOM degradation',
    meaning: 'Beyond-line-of-sight communications are degrading.',
    commanderQuestion: 'Do we need a backup path or space-link request?',
  },
  drone: {
    label: 'Drone relay status',
    meaning: 'UAS or relay behavior changed at the edge.',
    commanderQuestion: 'Is ISR still reaching the brigade?',
  },
  terrain: {
    label: 'Terrain risk',
    meaning: 'Terrain may block line-of-sight or relay coverage.',
    commanderQuestion: 'Should the relay geometry change?',
  },
}

const eventTypeOverrides: Record<string, string> = {
  autonomous_relay_handoff: 'Drone relay switched to preserve ISR flow.',
  base_defense_posture_change: 'Base defense posture changed under degraded space support.',
  close_approach_assessment: 'Space object proximity and SATCOM degradation are linked.',
  counterspace_capability_context: 'Known counterspace capability is relevant to this fight.',
  credential_probe: 'A key command or support system is being probed.',
  credential_spray: 'Login attacks are rising against a mission system.',
  cyber_response_action: 'Mission system moved into a hardened profile.',
  degraded_telemetry: 'Drone telemetry is degraded.',
  drone_spoofing: 'Drone identity or track does not look trustworthy.',
  fdir_assessment: 'CANOPY believes this is interference, not drone failure.',
  fdir_recovery_action: 'Drone isolated bad navigation input and recovered.',
  gnss_jamming_signature: 'GPS jamming pattern detected.',
  gps_spoof: 'GPS position appears false or shifted.',
  overhead_collection_window: 'Adversary collection window is opening overhead.',
  overhead_ir_cue: 'Overhead warning detected possible inbound UAS activity.',
  pnt_spoofing: 'GPS timing or position appears manipulated.',
  proximity_operations: 'Nearby space object is maneuvering close to friendly support.',
  relay_candidate_ready: 'A better drone relay is ready.',
  relay_mesh_status: 'Drone relay mesh status changed.',
  rpo_close_approach: 'Nearby space object entered the protected watch box.',
  satcom_degradation: 'SATCOM link quality is degrading.',
  satcom_link_margin_drop: 'SATCOM link margin dropped.',
  satcom_rf_spike: 'RF spike overlaps SATCOM backup routing.',
  terrain_masking_risk: 'Terrain may block the current relay path.',
  uas_control_link_detected: 'Possible UAS control link detected.',
  iran_counter_c5isr_assessment: 'CANOPY fused the counter-C5ISR event set.',
  missile_uas_capability_context: 'Missile and UAS capability context added.',
}

const actionByDomain: Record<Domain, string> = {
  orbit: 'Notify space support cell and protect backup comms.',
  sda: 'Keep overhead warning and custody feeds in the commander update.',
  rf_ew: 'Reduce emissions where possible and shift to hardened comms.',
  cyber: 'Hold automated tasking and verify mission-system access.',
  osint: 'Use as context, not proof; keep watching the next window.',
  humint: 'Confirm with other feeds before changing movement.',
  pnt: 'Do not trust GPS-only coordinates for movement or fires.',
  satcom: 'Prepare alternate BLOS path or request space-link support.',
  drone: 'Keep ISR moving through the healthiest relay node.',
  terrain: 'Move relay geometry or raise the drone if needed.',
}

const sourceAliases: Record<string, string> = {
  'base-gnss-monitor': 'Base GPS monitor',
  'brigade-pnt-monitor': 'Brigade GPS monitor',
  'brigade-satcom-controller': 'Brigade SATCOM controller',
  'brigade-siem': 'Brigade cyber sensor',
  'brigade-spectrum-team': 'Brigade EW team',
  'canopy-correlation-engine': 'CANOPY mission cell',
  'convoy-pnt-health-monitor': 'Convoy GPS monitor',
  'gnss-integrity-fusion': 'GPS integrity fusion',
  'gnss-integrity-monitor': 'GPS integrity monitor',
  'gnss-monitor-luzon': 'Luzon GPS monitor',
  'joint-spectrum-operations-cell': 'Joint EW cell',
  'orbit-pass-screen': 'Space tracking cell',
  'rpo-close-approach-overlay': 'Space tracking cell',
  'satcom-network-controller': 'SATCOM controller',
  'spectrum-monitor-guam': 'Guam EW monitor',
  'telemetry-quality-monitor': 'Telemetry monitor',
  'uas-swarm-controller': 'UAS swarm controller',
}

const assetAliases: Record<string, string> = {
  'BASE-CUAS-SENSOR-NET': 'Base C-UAS sensors',
  'BDE-C2-GATEWAY': 'Brigade C2 gateway',
  'BDE-SATCOM-1': 'Brigade SATCOM',
  'BDE-UAS-MESH': 'Brigade drone mesh',
  'CANOPY-MISSION-CELL': 'CANOPY mission cell',
  'GNSS-MON-LUZON-2': 'Luzon GPS monitor',
  'SPACE-PNT-SUPPORT': 'GPS support cell',
  'UAS-LINK-GROUP-B': 'UAS link group B',
}

export function domainLabel(domain: Domain): string {
  return domainCopy[domain].label
}

export function plainEventName(signal: Signal): string {
  if (signal.payload.event_type === signal.domain) {
    return `${domainCopy[signal.domain].label} report`
  }

  return (
    eventTypeOverrides[signal.payload.event_type] ??
    signal.payload.event_type.replaceAll('_', ' ')
  )
}

const stringArray = (value: unknown): string[] =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []

const numberValue = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null

const compactAssetSubject = (assets: string[]) => {
  if (!assets.length) {
    return 'Affected system'
  }

  const droneCount = assets.filter((asset) => asset.startsWith('DRONE-')).length
  if (droneCount === assets.length) {
    return droneCount === 1 ? assets[0] : `${droneCount} drones`
  }

  return assets.length === 1 ? assets[0] : `${assets.length} assets`
}

const stripFinalPeriod = (value: string) => value.replace(/\.+$/, '')

const friendlySourceLabel = (signal: Signal) => {
  const asset = signal.payload.asset
  if (typeof asset === 'string') {
    return assetAliases[asset] ?? asset.replaceAll('-', ' ')
  }

  return sourceAliases[signal.source] ?? signal.source.replaceAll('-', ' ')
}

const oneLineForSignal = (signal: Signal, action: string) => {
  const observables = signal.payload.observables ?? {}
  const affectedAssets = stringArray(observables.affected_assets)
  const affectedSystems = stringArray(observables.affected_systems)
  const affectedSubject = compactAssetSubject(
    affectedAssets.length ? affectedAssets : affectedSystems,
  )
  const affectedCount = affectedAssets.length
    ? affectedAssets.length
    : affectedSystems.length
  const affectedVerb = affectedCount <= 1 ? 'shows' : 'show'
  const deltaMeters =
    numberValue(observables.delta_meters) ??
    numberValue(observables.position_shift_m)
  const missDistanceKm = numberValue(observables.miss_distance_km)
  const newPrimary =
    typeof observables.new_primary === 'string' ? observables.new_primary : null
  const linkMarginDb = numberValue(observables.link_margin_db)
  const packetLossPct = numberValue(observables.packet_loss_pct)

  switch (signal.payload.event_type) {
    case 'gps_spoof':
      return `${affectedSubject} ${affectedVerb} GPS drift${deltaMeters ? ` of ${Math.round(deltaMeters)}m` : ''}; verify coordinates before movement or fires.`
    case 'pnt_spoofing':
      return `GPS time or position is biased${deltaMeters ? ` by about ${Math.round(deltaMeters)}m` : ''}; confirm navigation with non-GPS sources.`
    case 'gnss_jamming_signature':
      return `GPS jamming is degrading navigation and timing; ${stripFinalPeriod(action)}.`
    case 'rf_interference':
      return `EW interference is degrading ${affectedSubject.toLowerCase()}; shift to hardened comms.`
    case 'satcom_degradation':
      return `SATCOM is degrading${packetLossPct ? ` with ${packetLossPct.toFixed(1)}% loss` : ''}; prepare alternate BLOS routing.`
    case 'satcom_link_margin_drop':
      return `SATCOM link margin is low${linkMarginDb ? ` at ${linkMarginDb.toFixed(1)} dB` : ''}; protect the backup route.`
    case 'satcom_rf_spike':
      return 'RF energy is hitting the SATCOM backup window; watch route acquisition.'
    case 'autonomous_relay_handoff':
      return `Drone relay shifted${newPrimary ? ` to ${newPrimary}` : ''}; ISR feed remains connected.`
    case 'fdir_recovery_action':
      return `${signal.payload.asset ?? 'Drone'} isolated bad GPS input; ISR continues with reduced coordinate confidence.`
    case 'credential_probe':
    case 'credential_spray':
      return 'Mission-system logins are being probed; verify access before automated tasking.'
    case 'rpo_close_approach':
      return `Object is inside the satellite watch box${missDistanceKm ? ` at ${missDistanceKm.toFixed(1)} km` : ''}; watch support degradation.`
    case 'proximity_operations':
      return 'Nearby space object maneuvered near friendly support; request space-cell attention.'
    case 'close_approach_assessment':
      return 'SATCOM degradation aligns with a close satellite approach; plan protective options.'
    case 'overhead_collection_window':
      return 'Adversary overhead collection window is opening; mask movement and emissions.'
    case 'terrain_masking_risk':
      return 'Terrain may block the relay path; adjust drone altitude or relay geometry.'
    default:
      return signal.payload.summary
  }
}

export function commanderSignalSummary(signal: Signal): {
  label: string
  headline: string
  oneLine: string
  detail: string
  whyItMatters: string
  action: string
  location: string
  confidenceLabel: string
  sourceLabel: string
} {
  const copy = domainCopy[signal.domain]
  const confidence = Math.round(signal.confidence * 100)
  const observables = signal.payload.observables
  const demoAction =
    typeof observables?.demo_action === 'string'
      ? observables.demo_action.replaceAll('_', ' ')
      : null
  const spaceDependency =
    typeof observables?.space_dependency === 'string'
      ? observables.space_dependency
      : null
  const action = demoAction ?? actionByDomain[signal.domain]

  return {
    label: copy.label,
    headline: signal.payload.summary,
    oneLine: oneLineForSignal(signal, action),
    detail: plainEventName(signal),
    whyItMatters: spaceDependency ?? copy.meaning,
    action,
    location: signal.location.label ?? signal.source,
    confidenceLabel: `${confidence}% confidence`,
    sourceLabel: friendlySourceLabel(signal),
  }
}

export function commanderEventSummary(event: UIEvent | null): {
  state: 'White' | 'Amber' | 'Red'
  headline: string
  body: string
  action: string
  urgency: string
} {
  if (!event) {
    return {
      state: 'White',
      headline: 'CANOPY is building the picture',
      body: 'Signals are arriving. No commander-facing threat package is ready yet.',
      action: 'Keep monitoring',
      urgency: 'No immediate action',
    }
  }

  const state =
    event.severity === 'critical' || event.severity === 'high' ? 'Red' : 'Amber'

  return {
    state,
    headline: event.title,
    body: event.message,
    action: event.recommendation?.summary ?? 'No commander approval required yet',
    urgency:
      event.type === 'recommendation_created'
        ? 'Commander decision requested'
        : 'Awareness update',
  }
}
