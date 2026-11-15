'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Loader2, MapPin, PackageCheck, RefreshCw, Truck } from 'lucide-react'
import { apiUrl } from '@/lib/api'

function getOrCreateDriverId() {
  let id = localStorage.getItem('agrovani_driver_id')
  if (!id) {
    id = `driver-${window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
    localStorage.setItem('agrovani_driver_id', id)
  }
  return id
}

export default function DispatchQueue() {
  const [driverId, setDriverId] = useState('')
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [busyOrderId, setBusyOrderId] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (id = driverId) => {
    if (!id) return
    try {
      const [ordersResponse, pickupsResponse] = await Promise.all([
        fetch(apiUrl(`/api/marketplace/orders?dispatchFor=${encodeURIComponent(id)}`)),
        fetch(apiUrl(`/api/residue/pickups?dispatchFor=${encodeURIComponent(id)}`)),
      ])
      const [orders, pickups] = await Promise.all([ordersResponse.json(), pickupsResponse.json()])
      if (!ordersResponse.ok || !Array.isArray(orders)) {
        throw new Error(orders.error || 'Unable to load deliveries')
      }
      if (!pickupsResponse.ok || !Array.isArray(pickups)) {
        throw new Error(pickups.error || 'Unable to load residue pickups')
      }
      setOrders([
        ...orders.map((order) => ({ ...order, kind: 'order' })),
        ...pickups,
      ])
      setError('')
    } catch (loadError) {
      setError(loadError.message || 'Unable to load deliveries')
    } finally {
      setLoading(false)
    }
  }, [driverId])

  useEffect(() => {
    setDriverId(getOrCreateDriverId())
  }, [])

  useEffect(() => {
    if (!driverId) return undefined
    refresh(driverId)
    const intervalId = window.setInterval(() => refresh(driverId), 15000)
    return () => window.clearInterval(intervalId)
  }, [driverId, refresh])

  const counts = useMemo(() => ({
    available: orders.filter((order) => order.kind === 'residue_pickup'
      ? order.status === 'scheduled'
      : order.status === 'out_for_delivery' && !order.assignedToYou).length,
    assigned: orders.filter((order) => order.kind === 'residue_pickup'
      ? order.status === 'assigned' && order.assignedToYou
      : order.status === 'out_for_delivery' && order.assignedToYou).length,
    completed: orders.filter((order) => order.kind === 'residue_pickup'
      ? order.status === 'completed' && order.assignedToYou
      : order.status === 'delivered' && order.assignedToYou).length,
  }), [orders])

  async function updateDelivery(order, action) {
    setBusyOrderId(order.id)
    setError('')
    try {
      const isPickup = order.kind === 'residue_pickup'
      const response = await fetch(apiUrl(isPickup ? '/api/residue/pickups' : '/api/marketplace/orders'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isPickup
          ? { id: order.id, action: action === 'claim' ? 'claim' : 'complete', driverId }
          : action === 'claim'
            ? { id: order.id, action, driverId }
            : { id: order.id, status: 'delivered', driverId }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update delivery')
      setOrders((current) => current.map((item) => item.id === order.id ? { ...data, kind: order.kind } : item))
    } catch (updateError) {
      setError(updateError.message || 'Unable to update delivery')
      await refresh()
    } finally {
      setBusyOrderId('')
    }
  }

  return (
    <section className="rounded-[28px] border border-white/80 bg-white/80 p-6 shadow-sm backdrop-blur-md">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><Truck className="h-5 w-5 text-violet-600" /><h2 className="text-xl font-bold text-slate-900">Delivery dispatch</h2></div>
          <p className="mt-1 text-sm text-slate-600">Available and assigned deliveries refresh automatically.</p>
        </div>
        <button type="button" onClick={() => refresh()} disabled={loading} className="flex items-center gap-2 rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Available', value: counts.available, icon: PackageCheck },
          { label: 'Assigned to you', value: counts.assigned, icon: Truck },
          { label: 'Completed', value: counts.completed, icon: Check },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl bg-slate-50 p-4">
            <div className="flex items-center gap-2 text-slate-600"><Icon className="h-4 w-4" /><span className="text-xs font-semibold">{label}</span></div>
            <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-3">
        {orders.length ? orders.map((order) => {
          const assignedToDriver = order.assignedToYou
          const isPickup = order.kind === 'residue_pickup'
          const available = isPickup
            ? order.status === 'scheduled'
            : order.status === 'out_for_delivery' && !assignedToDriver
          const completed = isPickup
            ? order.status === 'completed' && assignedToDriver
            : order.status === 'delivered' && assignedToDriver
          const assigned = isPickup ? order.status === 'assigned' && assignedToDriver : assignedToDriver && !completed
          return (
            <article key={order.id} className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-900">{isPickup ? `${order.residueType} pickup` : order.listingName || 'Marketplace delivery'}</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {isPickup
                      ? `${Number(order.quantityQuintals).toLocaleString('en-IN')} quintals · ${order.farmerName || 'Farmer'}`
                      : `${order.quantity} unit${order.quantity === 1 ? '' : 's'} · ${order.buyerName || 'Farmer'}`}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${completed ? 'bg-emerald-100 text-emerald-800' : assignedToDriver ? 'bg-violet-100 text-violet-800' : 'bg-sky-100 text-sky-800'}`}>
                  {completed ? (isPickup ? 'Collected' : 'Delivered') : assigned ? 'Assigned to you' : 'Available'}
                </span>
              </div>
              <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /><span>{isPickup ? `Farm pickup: ${order.farmerName || 'Farmer'}` : `Pickup: ${order.sellerName || 'Seller'}${order.sellerPlace ? ` · ${order.sellerPlace}` : ''}`}{order.district || order.pickupDistrict ? ` · ${order.district || order.pickupDistrict}` : ''}</span></p>
                {!isPickup && <p className="flex items-start gap-2"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><span>Deliver to: {order.farmName || 'Farm'}{order.deliveryDistrict ? ` · ${order.deliveryDistrict}` : ''}</span></p>}
                {isPickup && order.pickupDate && <p className="flex items-center gap-2 sm:col-span-2"><CalendarDays className="h-4 w-4 text-slate-400" />Preferred pickup {new Date(`${order.pickupDate}T00:00:00`).toLocaleDateString('en-IN')}</p>}
                {isPickup && order.notes && <p className="sm:col-span-2 text-xs text-slate-500">{order.notes}</p>}
                {order.expectedDeliveryAt && <p className="flex items-center gap-2 sm:col-span-2"><CalendarDays className="h-4 w-4 text-slate-400" />Expected {new Date(order.expectedDeliveryAt).toLocaleDateString('en-IN')}</p>}
              </div>
              {available && (
                <button
                  type="button"
                  onClick={() => updateDelivery(order, 'claim')}
                  disabled={busyOrderId === order.id}
                  className="mt-4 rounded-full bg-violet-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busyOrderId === order.id ? <><Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Updating…</> : 'Accept delivery'}
                </button>
              )}
              {assigned && (
                <button
                  type="button"
                  onClick={() => updateDelivery(order, 'complete')}
                  disabled={busyOrderId === order.id}
                  className="mt-4 rounded-full bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {busyOrderId === order.id ? 'Updating…' : isPickup ? 'Mark pickup complete' : 'Mark delivered'}
                </button>
              )}
            </article>
          )
        }) : (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
            {loading ? 'Loading deliveries…' : 'No deliveries are available right now.'}
          </div>
        )}
      </div>
    </section>
  )
}
