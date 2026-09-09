'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CloudRain, Droplets, Leaf, Loader2, Sun, ThermometerSun, Wind } from 'lucide-react'
import WeatherMapCard from '@/components/farmer/WeatherMapCard'

function weatherAdvice({ diagnostic, farm }) {
  const diurnal = Number(diagnostic?.scores?.diurnal || 0)
  const drought = Number(diagnostic?.droughtIndex?.value || 0)
  const rain = Number(diagnostic?.weather?.precipitation || diagnostic?.weather?.precip || 0)
  if (diurnal >= 6) return { tone: 'amber', title: 'Protect the crop from heat', text: `Heat stress is elevated for ${farm.cropType}. Prefer early-morning field work, check soil moisture, and avoid spraying in the hottest hours.` }
  if (drought >= 0.6 || rain < 2) return { tone: 'sky', title: 'Check moisture before irrigation', text: 'Rainfall appears limited. Check the soil at root depth before irrigating, and avoid applying more water than the crop needs.' }
  if (rain >= 15) return { tone: 'blue', title: 'Plan around rain', text: 'Rainfall is likely to affect field access. Delay non-essential spraying, keep drainage clear, and inspect low-lying areas after the rain.' }
  return { tone: 'green', title: 'Conditions look workable', text: `Weather conditions look moderate for ${farm.cropType}. Continue scouting and use the forecast layer before scheduling a field operation.` }
}

function Metric({ icon: Icon, label, value, detail }) {
  return <div className="rounded-2xl border border-slate-200 bg-white/70 p-4"><div className="flex items-center gap-2 text-slate-500"><Icon className="h-4 w-4" /><span className="text-xs font-semibold uppercase tracking-[0.16em]">{label}</span></div><p className="mt-3 text-2xl font-bold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></div>
}

export default function WeatherPage() {
  const [farms, setFarms] = useState([])
  const [farmId, setFarmId] = useState('')
  const [weather, setWeather] = useState(null)
  const [stress, setStress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const farm = useMemo(() => farms.find((item) => item.id === farmId) || farms[0] || null, [farms, farmId])

  useEffect(() => {
    fetch('/api/farms').then(async (response) => {
      const data = await response.json()
      if (!response.ok || !Array.isArray(data)) throw new Error(data.error || 'Unable to load farms')
      setFarms(data)
      setFarmId(data[0]?.id || '')
    }).catch((loadError) => setError(loadError.message || 'Unable to load farm locations.')).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!farm) return
    setLoading(true)
    Promise.all([
      fetch(`/api/weather-map?lat=${farm.latitude}&lon=${farm.longitude}`).then((response) => response.json()),
      fetch(`/api/stress?farmId=${farm.id}`).then((response) => response.json()),
    ]).then(([mapData, stressData]) => { setWeather(mapData); setStress(stressData) }).catch((loadError) => setError(loadError.message || 'Weather data is unavailable.')).finally(() => setLoading(false))
  }, [farm])

  const diagnostic = stress?.diagnostic
  const advice = weatherAdvice({ diagnostic: { ...diagnostic, weather: stress?.weather }, farm: farm || { cropType: 'crop' } })
  const toneClasses = { green: 'border-emerald-200 bg-emerald-50 text-emerald-950', amber: 'border-amber-200 bg-amber-50 text-amber-950', sky: 'border-sky-200 bg-sky-50 text-sky-950', blue: 'border-blue-200 bg-blue-50 text-blue-950' }

  return <main className="page-farmer min-h-screen p-4 md:p-8"><div className="mx-auto max-w-7xl">
    <header className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between"><Link href="/farmer/dashboard" className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-950"><ArrowLeft className="h-4 w-4" /> Back to farmer dashboard</Link><div className="flex items-center gap-3"><label htmlFor="weather-farm" className="text-sm font-semibold text-slate-600">Farm</label><select id="weather-farm" value={farm?.id || ''} onChange={(event) => setFarmId(event.target.value)} className="rounded-xl border border-white/80 bg-white/80 px-3 py-2 text-sm font-semibold text-slate-900"><option value="" disabled>Select a farm</option>{farms.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.village}</option>)}</select></div></header>
    <div className="mb-6 rounded-[28px] bg-gradient-to-r from-sky-700 via-cyan-600 to-emerald-600 px-6 py-7 text-white shadow-[0_20px_45px_rgba(14,116,144,0.25)]"><p className="text-xs font-bold uppercase tracking-[0.25em] text-white/75">Field weather desk</p><h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Weather map, forecast and field advice</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/85">Compare approved source layers, see the current farm forecast, and get a plain-language action for today. Data status and timestamps stay visible.</p></div>
    {error && <p role="alert" className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
    {loading && <div className="mb-6 flex items-center gap-2 rounded-2xl border border-white/70 bg-white/70 px-4 py-3 text-sm text-slate-600"><Loader2 className="h-4 w-4 animate-spin" /> Loading forecast and field conditions…</div>}
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.65fr]"><WeatherMapCard lat={farm?.latitude} lon={farm?.longitude} /><section className="glass-card"><div className="flex items-center gap-2"><CloudRain className="h-5 w-5 text-sky-600" /><h2 className="text-xl font-semibold text-slate-900">Farm forecast</h2></div><p className="mt-1 text-sm text-slate-500">{farm ? `${farm.village}, ${farm.state}` : 'Select a farm'}</p><div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><Metric icon={ThermometerSun} label="Day temperature" value={stress?.weather?.tmax != null ? `${Number(stress.weather.tmax).toFixed(1)}°C` : '—'} detail="Current weather adapter" /><Metric icon={Sun} label="Night temperature" value={stress?.weather?.tmin != null ? `${Number(stress.weather.tmin).toFixed(1)}°C` : '—'} detail="Current weather adapter" /><Metric icon={Droplets} label="Rainfall" value={stress?.weather?.precipitation != null ? `${stress.weather.precipitation} mm` : stress?.weather?.precip != null ? `${stress.weather.precip} mm` : '—'} detail="Forecast window" /><Metric icon={Wind} label="Data status" value={weather?.status || '—'} detail={weather?.freshness ? `Updated ${new Date(weather.freshness).toLocaleString('en-IN')}` : 'No timestamp'} /></div></section></div>
    <section className={`mt-6 rounded-[28px] border p-6 ${toneClasses[advice.tone]}`}><div className="flex items-start gap-3"><div className="rounded-2xl bg-white/70 p-3"><Leaf className="h-5 w-5" /></div><div><p className="text-xs font-bold uppercase tracking-[0.22em] opacity-70">Weather-wise recommendation</p><h2 className="mt-2 text-2xl font-semibold">{advice.title}</h2><p className="mt-2 max-w-3xl text-sm leading-6 opacity-85">{advice.text}</p><p className="mt-4 text-xs opacity-70">This is a model-based field prompt, not a guarantee. Confirm local conditions before spraying, irrigating, or entering the field.</p></div></div></section>
    <p className="mt-6 text-xs text-slate-500">Source layers: Indian satellite / INSAT-MOSDAC label, local weather / IMD-station label, and world forecast / NOAA-GFS label. The current MVP marks unconfigured adapters as demo data.</p>
  </div></main>
}