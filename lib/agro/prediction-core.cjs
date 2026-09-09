const BASE_YIELD = { Rice: 22, Wheat: 18, Soybean: 10, Cotton: 8 }

function predictYield(input = {}) {
  const crop = input.crop || 'Rice'
  const area = Math.max(0.1, Number(input.areaInAcres) || 1)
  const soilPh = Number(input.soilPh)
  const nitrogen = Number(input.nitrogenKgPerHa)
  const base = BASE_YIELD[crop] || 15
  const soilAdjustment = Number.isFinite(soilPh) ? Math.max(-0.12, Math.min(0.08, (soilPh - 6.5) * 0.06)) : 0
  const nutrientAdjustment = Number.isFinite(nitrogen) ? Math.max(-0.1, Math.min(0.1, (nitrogen - 90) / 900)) : 0
  const expectedYield = Number((base * (1 + soilAdjustment + nutrientAdjustment)).toFixed(2))
  const uncertainty = Number((base * (Number.isFinite(soilPh) && Number.isFinite(nitrogen) ? 0.14 : 0.22)).toFixed(2))
  const relativeUncertainty = uncertainty / Math.max(expectedYield, 1)
  return {
    crop, areaInAcres: area, unit: 'quintal/acre', expectedYield,
    lowerBound: Number(Math.max(0, expectedYield - uncertainty).toFixed(2)),
    upperBound: Number((expectedYield + uncertainty).toFixed(2)),
    estimatedTreatmentAdvantage: Number((expectedYield * 0.06).toFixed(2)),
    riskLevel: relativeUncertainty > 0.19 ? 'High' : relativeUncertainty > 0.14 ? 'Medium' : 'Low',
    confidenceScore: Number((1 - relativeUncertainty).toFixed(2)),
  }
}

module.exports = { predictYield }