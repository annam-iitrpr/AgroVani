import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { DEMO_MANDI_PRICES } from './data'

let database

export function getAgroStore() {
  if (database) return database
  try {
    const directory = process.env.AGROVANI_DATA_DIR || join(process.cwd(), '.data')
    mkdirSync(directory, { recursive: true })
    database = new DatabaseSync(join(directory, 'agrovani.sqlite'))
    database.exec('CREATE TABLE IF NOT EXISTS mandi_prices (commodity TEXT, market TEXT, state TEXT, modal_price REAL, msp REAL, observed_at TEXT, source TEXT)')
    const count = database.prepare('SELECT COUNT(*) AS count FROM mandi_prices').get().count
    if (!count) {
      const insert = database.prepare('INSERT INTO mandi_prices VALUES (?, ?, ?, ?, ?, ?, ?)')
      for (const row of DEMO_MANDI_PRICES) insert.run(row.commodity, row.market, row.state, row.modalPrice, row.msp, row.observedAt, row.source)
    }
    return database
  } catch (error) {
    console.warn('SQLite MVP store unavailable:', error.message)
    return null
  }
}