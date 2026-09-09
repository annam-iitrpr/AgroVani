const now = new Date()

export const WEATHER_LAYERS = [
  { id: 'india-satellite', name: 'Indian satellite', provider: 'INSAT / MOSDAC', status: 'demo', description: 'Cloud and rainfall view. Connect MOSDAC credentials for live imagery.' },
  { id: 'local-weather', name: 'Local weather', provider: 'IMD / local station', status: 'demo', description: 'District observations and alerts. Connect the local weather server for live values.' },
  { id: 'usa-forecast', name: 'World forecast', provider: 'NOAA / GFS', status: 'demo', description: 'Global forecast model layer. Connect NOAA or an approved proxy for live tiles.' },
]

export const DEMO_MANDI_PRICES = [
  { commodity: 'Rice', variety: 'Common', state: 'Punjab', market: 'Patiala', modalPrice: 2320, msp: 2300, unit: 'quintal', observedAt: now.toISOString(), source: 'Agmarknet-style demo data' },
  { commodity: 'Wheat', variety: 'FAQ', state: 'Punjab', market: 'Ludhiana', modalPrice: 2480, msp: 2425, unit: 'quintal', observedAt: now.toISOString(), source: 'Agmarknet-style demo data' },
  { commodity: 'Soybean', variety: 'Yellow', state: 'Madhya Pradesh', market: 'Indore', modalPrice: 4620, msp: 4892, unit: 'quintal', observedAt: now.toISOString(), source: 'Agmarknet-style demo data' },
  { commodity: 'Cotton', variety: 'Medium Staple', state: 'Maharashtra', market: 'Nagpur', modalPrice: 7200, msp: 7121, unit: 'quintal', observedAt: now.toISOString(), source: 'Agmarknet-style demo data' },
]

export const MSP = { Rice: 2300, Wheat: 2425, Soybean: 4892, Cotton: 7121 }

export const MANDI_SOURCE = 'Agmarknet / Agmarknet 2.0 (demo adapter until API credentials are configured)'