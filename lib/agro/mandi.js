import { DEMO_MANDI_PRICES, MANDI_SOURCE, MSP } from './data'
import { getAgroStore } from './storage'

const daysAgo = (date) => Math.floor((Date.now() - new Date(date).getTime()) / 86400000)

export function lookupMandiPrices(filters = {}) {
  const query = String(filters.commodity || '').toLowerCase()
  const store = getAgroStore()
  const storedRows = store
    ? store.prepare('SELECT commodity, market, state, modal_price, msp, observed_at, source FROM mandi_prices').all().map((row) => ({ commodity: row.commodity, variety: 'Demo snapshot', state: row.state, market: row.market, modalPrice: row.modal_price, msp: row.msp, unit: 'quintal', observedAt: row.observed_at, source: row.source }))
    : DEMO_MANDI_PRICES
  const rows = storedRows.filter((row) => !query || `${row.commodity} ${row.variety}`.toLowerCase().includes(query))
    .filter((row) => !filters.state || row.state === filters.state)
    .filter((row) => !filters.market || row.market === filters.market)
  if (!rows.length) return { status: 'insufficient data', rows: [], source: MANDI_SOURCE, freshness: null }
  return { status: 'ok', rows: rows.map((row) => ({ ...row, freshnessDays: daysAgo(row.observedAt), premiumDiscountVsMsp: Number((((row.modalPrice - row.msp) / row.msp) * 100).toFixed(1)), trend7Day: [row.modalPrice - 90, row.modalPrice - 40, row.modalPrice - 60, row.modalPrice - 15, row.modalPrice + 10, row.modalPrice - 5, row.modalPrice] })), source: MANDI_SOURCE, freshness: new Date(Math.max(...rows.map((row) => new Date(row.observedAt).getTime()))).toISOString() }
}

export function compareMsp({ commodity, price }) {
  const msp = MSP[commodity]
  if (!msp || !Number.isFinite(Number(price))) return { status: 'insufficient data', commodity, msp: null, price: null }
  const difference = Number(price) - msp
  return { status: 'ok', commodity, msp, price: Number(price), difference, premiumDiscountPercent: Number(((difference / msp) * 100).toFixed(1)) }
}

export function softSellSignal(row) {
  if (!row || daysAgo(row.observedAt) > 2) return { signal: 'insufficient data', confidence: 0, note: 'Price is missing or stale. This is not financial advice.' }
  const premium = ((row.modalPrice - row.msp) / row.msp) * 100
  return { signal: premium >= 2 ? 'consider sell' : premium <= -2 ? 'consider hold' : 'watch', confidence: Number(Math.min(0.8, 0.45 + Math.abs(premium) / 20).toFixed(2)), note: 'Soft market signal only. Not financial advice.' }
}