import type { Domain, Signal, UIEvent } from '../types/canopy'

const domainCopy: Record<
  Domain,
  { label: string; meaning: string; commanderQuestion: string }
> = {
  orbit: {
    label: 'Space object',
    meaning: 'A satellite or nearby object may affect friendly space support.',
    commanderQuestion: 'Could this disrupt ISR, warning, or communications?',
  },
  sda: {
    label: 'Space custody',
    meaning: 'Space tracking or overhead warning changed.',
    commanderQuestion: 'Does the brigade need space support attention?',
  },
  rf_ew: {
    label: 'Electronic attack',
    meaning: 'Enemy jamming or interference may be affecting links.',
    commanderQuestion: 'Are radios, drones, or SATCOM starting to degrade?',
  },
  cyber: {
    label: 'Cyber pressure',
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
    label: 'GPS trust',
    meaning: 'Position, navigation, or timing may not be trustworthy.',
    commanderQuestion: 'Can we trust coordinates for movement or fires?',
  },
  satcom: {
    label: 'SATCOM health',
    meaning: 'Beyond-line-of-sight communications are degrading.',
    commanderQuestion: 'Do we need a backup path or space-link request?',
  },
  drone: {
    label: 'Drone network',
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

export function commanderSignalSummary(signal: Signal): {
  label: string
  headline: string
  detail: string
  whyItMatters: string
  action: string
  location: string
  confidenceLabel: string
} {
  const copy = domainCopy[signal.domain]
  const confidence = Math.round(signal.confidence * 100)
  const asset = signal.payload.asset ? `${signal.payload.asset}: ` : ''

  return {
    label: copy.label,
    headline: `${asset}${plainEventName(signal)}`,
    detail: signal.payload.summary,
    whyItMatters: copy.commanderQuestion,
    action: actionByDomain[signal.domain],
    location: signal.location.label ?? signal.source,
    confidenceLabel: `${confidence}% confidence`,
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
