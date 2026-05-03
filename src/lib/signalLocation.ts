import { toPoint as mgrsToPoint } from 'mgrs'
import type { Signal, SignalLocation } from '../types/canopy'

export type LonLat = [number, number]

export type SignalBounds = {
  west: number
  south: number
  east: number
  north: number
}

export const signalCoordinate = (signal: Signal): LonLat | null => {
  const { lat, lng, mgrs, area_wkt } = signal.location

  if (typeof lng === 'number' && typeof lat === 'number') {
    return [lng, lat]
  }

  if (mgrs) {
    try {
      const [lon, mgrsLat] = mgrsToPoint(mgrs)
      return [lon, mgrsLat]
    } catch {
      return null
    }
  }

  const polygon = polygonCoordinates(area_wkt)
  if (polygon.length) {
    const [lonTotal, latTotal] = polygon.reduce(
      ([lonSum, latSum], [lon, polygonLat]) => [
        lonSum + lon,
        latSum + polygonLat,
      ],
      [0, 0],
    )
    return [lonTotal / polygon.length, latTotal / polygon.length]
  }

  return null
}

export const polygonCoordinates = (
  areaWkt: SignalLocation['area_wkt'],
): LonLat[] => {
  const match = areaWkt?.match(/POLYGON\s*\(\((.+)\)\)/i)
  if (!match) {
    return []
  }

  return match[1]
    .split(',')
    .map((pair) => pair.trim().split(/\s+/).map(Number))
    .filter(
      (point): point is LonLat =>
        point.length === 2 &&
        Number.isFinite(point[0]) &&
        Number.isFinite(point[1]),
    )
}

export const boundsForSignals = (
  signals: Signal[],
  fallback: SignalBounds,
): SignalBounds => {
  const points = signals.flatMap((signal) => {
    const polygon = polygonCoordinates(signal.location.area_wkt)
    if (polygon.length) {
      return polygon
    }

    const point = signalCoordinate(signal)
    return point ? [point] : []
  })

  if (!points.length) {
    return fallback
  }

  const lons = points.map(([lon]) => lon)
  const lats = points.map(([, lat]) => lat)
  const west = Math.min(...lons)
  const east = Math.max(...lons)
  const south = Math.min(...lats)
  const north = Math.max(...lats)
  const lonPad = Math.max((east - west) * 0.18, 0.045)
  const latPad = Math.max((north - south) * 0.18, 0.045)

  return {
    west: Math.max(-180, west - lonPad),
    south: Math.max(-85, south - latPad),
    east: Math.min(180, east + lonPad),
    north: Math.min(85, north + latPad),
  }
}
