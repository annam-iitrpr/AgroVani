'use client'

import { useEffect, useState } from 'react'
import { Download, MessageCircle, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react'

function money(value) { return Number(value || 0).toLocaleString('en-IN') }

export default function AgroInsights({ farm }) {
  const [prediction, setPrediction] = useState(null)
  const [mandi, setMandi] = useState(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!farm) return
    setBusy(true)
    Promise.all([
      fetch('/api/yield-prediction', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(farm) }).then((r) => r.json()),
      fetch(`/api/mandi-prices?commodity=${encodeURIComponent(farm.cropType || 'Rice')}&state=${encodeURIComponent(farm.state || '')}`).then((r) => r.json()),
    ]).then(([yieldData, mandiData]) => { setPrediction(yieldData); setMandi(mandiData?.rows?.[0] || null) }).catch(() => setMessage('Some data could not be loaded. Please refresh.')).finally(() => setBusy(false))
  }, [farm])

  async function shareReport() {
    if (!farm || !prediction) return
    const response = await fetch('/api/whatsapp-share', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ farm, prediction, mandi: mandi || {} }) })
    const data = await response.json()
    window.open(`https://wa.me/?text=${encodeURIComponent(data.text || '')}`, '_blank', 'noopener,noreferrer')
  }

  async function printReport() {
    if (!farm || !prediction) return
    const response = await fetch('/api/report?format=html', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ farm, prediction, mandi: mandi || {}, revenueGain: prediction.estimatedTreatmentAdvantage * (mandi?.modalPrice || 0) * (farm.areaInAcres || 1), productCost: 1200 * (farm.areaInAcres || 1) }) })
    const html = await response.text()
    const reportWindow = window.open('', '_blank')
    if (reportWindow) { reportWindow.document.write(html); reportWindow.document.close() }
  }

  if (!farm) return null
  return (
    <section className="grid gap-6 lg:grid-cols-3">
      <div className="glass-card lg:col-span-2">
        <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-emerald-700">Yield advisory</p><h2 className="mt-2 text-2xl font-semibold text-slate-900">Predicted yield range</h2></div>{busy && <RefreshCw className="h-5 w-5 animate-spin text-emerald-600" />}</div>
        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-2xl bg-emerald-50 p-4"><p className="text-xs text-emerald-700">Expected</p><p className="mt-2 text-2xl font-bold text-emerald-900">{prediction?.expectedYield ?? '—'}</p><p className="text-xs text-emerald-700">quintal/acre</p></div>
          <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Likely range</p><p className="mt-2 text-lg font-bold text-slate-900">{prediction ? `${prediction.lowerBound}–${prediction.upperBound}` : '—'}</p><p className="text-xs text-slate-500">quintal/acre</p></div>
          <div className="rounded-2xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Treatment advantage</p><p className="mt-2 text-2xl font-bold text-amber-900">{prediction?.estimatedTreatmentAdvantage ?? '—'}</p><p className="text-xs text-amber-700">estimated, not causal</p></div>
          <div className="rounded-2xl bg-sky-50 p-4"><p className="text-xs text-sky-700">Risk level</p><p className="mt-2 text-2xl font-bold text-sky-900">{prediction?.riskLevel ?? '—'}</p><p className="text-xs text-sky-700">confidence {prediction?.confidenceScore ?? '—'}</p></div>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">{prediction?.explanation || 'Loading model estimate…'} {prediction?.dataFreshness ? `Updated ${new Date(prediction.dataFreshness).toLocaleString('en-IN')}.` : ''}</p>
        {message && <p className="mt-2 text-sm text-red-600">{message}</p>}
      </div>
      <div className="glass-card">
        <div className="flex items-center gap-2"><div><p className="text-[10px] font-bold uppercase tracking-[0.25em] text-sky-700">Mandi tracker</p><h2 className="mt-2 text-xl font-semibold text-slate-900">{mandi ? mandi.market : 'Price unavailable'}</h2></div>{mandi && (mandi.premiumDiscountVsMsp >= 0 ? <TrendingUp className="ml-auto h-5 w-5 text-emerald-600" /> : <TrendingDown className="ml-auto h-5 w-5 text-amber-600" />)}</div>
        {mandi ? <><p className="mt-5 text-3xl font-bold text-slate-900">₹{money(mandi.modalPrice)}<span className="text-sm font-medium text-slate-500"> / quintal</span></p><p className="mt-2 text-sm text-slate-600">{mandi.premiumDiscountVsMsp}% vs MSP ₹{money(mandi.msp)}</p><p className="mt-2 text-xs text-slate-500">7-day trend: {mandi.trend7Day.join(' · ')}</p><p className="mt-3 text-xs text-slate-500">Source: {mandi.source}. Updated {new Date(mandi.observedAt).toLocaleString('en-IN')}.</p><p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">Soft signal: <strong>{mandi.recommendation?.signal}</strong>. {mandi.recommendation?.note}</p></> : <p className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-800">Insufficient data. No price guess is shown.</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button type="button" onClick={printReport} className="pill-dark"><Download className="mr-2 h-4 w-4" /> Print report</button><button type="button" onClick={shareReport} className="glass-btn"><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</button></div>
      </div>
    </section>
  )
}