'use client'

import dynamic from 'next/dynamic'
import { CloudSun, Layers3 } from 'lucide-react'

const WeatherLeaflet = dynamic(() => import('./WeatherLeaflet'), {
  ssr: false,
  loading: () => <div className="flex h-[390px] items-center justify-center bg-slate-100 text-sm text-slate-500">Loading India weather map…</div>,
})

export default function WeatherMapCard({ lat, lon }) {
  return (
    <section className="glass-card overflow-hidden">
      <div className="mb-4 flex flex-wrap items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700"><CloudSun className="h-5 w-5" /></div>
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Live weather map of India</h2>
          <p className="mt-1 text-sm text-slate-600">Switch layers to compare satellite, local weather, and world forecast views.</p>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600"><Layers3 className="h-3.5 w-3.5" /> 3 source layers</span>
      </div>
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
        <WeatherLeaflet lat={lat} lon={lon} />
      </div>
      <p className="mt-3 text-xs text-slate-500">Demo adapters are shown until approved INSAT/MOSDAC, local station, and NOAA/GFS credentials are configured. Check the layer name and timestamp before making a field decision.</p>
    </section>
  )
}