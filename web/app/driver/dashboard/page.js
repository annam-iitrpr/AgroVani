'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, MapPinned, Radio, Truck } from 'lucide-react'
import DispatchQueue from '@/components/driver/DispatchQueue'
import SupportDock from '@/components/SupportDock'

export default function DriverDashboard() {
  const [tab, setTab] = useState('dispatch')

  return (
    <main className="page-farmer min-h-screen p-4 text-slate-800 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6 flex flex-col gap-4 rounded-[24px] border border-white/80 bg-white/70 p-4 shadow-sm backdrop-blur-md md:flex-row md:items-center md:justify-between">
          <Link href="/login" className="flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> AgroVani Driver Console
          </Link>
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-violet-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.2em] text-violet-700">Driver</span>
            <Link href="/driver/route" className="pill-dark">Open live route</Link>
          </div>
        </header>

        <div className="mb-6 flex w-fit gap-1 rounded-full border border-white/80 bg-white/70 p-1 shadow-sm" role="tablist" aria-label="Driver workspace">
          {[
            { id: 'dispatch', label: 'Dispatch', icon: Truck },
            { id: 'logistics', label: 'Logistics', icon: MapPinned },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={`flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold ${tab === id ? 'bg-violet-700 text-white' : 'text-slate-600 hover:bg-white'}`}>
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>

        {tab === 'dispatch' ? (
          <div className="grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
            <DispatchQueue />

            <aside className="space-y-5">
            <div className="rounded-[28px] border border-white/80 bg-white/75 p-6 shadow-sm backdrop-blur-md">
              <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">Route and location</h2></div>
              <p className="mt-3 text-sm leading-6 text-slate-600">Open the live route page to share your current location and review delivery stops assigned to you.</p>
              <Link href="/driver/route" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">
                <Radio className="h-4 w-4" /> Open route and GPS
              </Link>
            </div>
            <div className="rounded-[28px] border border-sky-100 bg-sky-50/80 p-6">
              <h2 className="font-bold text-slate-900">Delivery steps</h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-700">
                <li>Accept an available delivery.</li>
                <li>Collect the order from the seller.</li>
                <li>Mark it delivered after handoff.</li>
              </ol>
            </div>
            </aside>
          </div>
        ) : (
          <section className="grid gap-6 lg:grid-cols-[1fr_1fr]">
            <div className="rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-sm">
              <div className="flex items-center gap-2"><MapPinned className="h-5 w-5 text-emerald-600" /><h2 className="text-xl font-bold text-slate-900">Live route and stops</h2></div>
              <p className="mt-3 text-sm leading-6 text-slate-600">Share your device location and review delivery and farm pickup stops assigned to you.</p>
              <Link href="/driver/route" className="mt-5 inline-flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"><Radio className="h-4 w-4" /> Open route and GPS</Link>
            </div>
            <div className="rounded-[28px] border border-emerald-100 bg-emerald-50/80 p-6">
              <h2 className="font-bold text-slate-900">Pickup handoff checklist</h2>
              <ol className="mt-3 list-inside list-decimal space-y-2 text-sm leading-6 text-slate-700">
                <li>Accept a listed delivery or farmer residue pickup.</li>
                <li>Confirm the pickup location and requested date.</li>
                <li>Complete the handoff in Dispatch when collection is finished.</li>
              </ol>
              <button type="button" onClick={() => setTab('dispatch')} className="mt-5 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">View dispatch queue</button>
            </div>
          </section>
        )}
      </div>
      <SupportDock role="driver" />
    </main>
  )
}
