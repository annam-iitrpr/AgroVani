import { WEATHER_LAYERS } from './data'

export function getWeatherMap({ lat = 22.5, lon = 79 } = {}) {
  return { center: { lat: Number(lat), lon: Number(lon) }, layers: WEATHER_LAYERS, freshness: new Date().toISOString(), status: 'demo', note: 'Connect approved Indian satellite, local weather, and NOAA/GFS server credentials before calling this live.' }
}