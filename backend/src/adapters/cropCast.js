const CROPCAST_URL = process.env.CROPCAST_URL || 'http://127.0.0.1:8000'

export async function predictCropYield({
  state,
  district,
  season,
  crop,
  year,
  area,
}) {
  const response = await fetch(`${CROPCAST_URL}/api/predict`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      state,
      district,
      season,
      crop,
      year,
      area,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`CropCast API error ${response.status}: ${errorText}`)
  }

  return response.json()
}