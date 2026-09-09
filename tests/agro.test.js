const test = require('node:test')
const assert = require('node:assert/strict')
const { predictYield } = require('../lib/agro/prediction-core.cjs')

test('prediction returns an interval, confidence, and non-causal treatment estimate', () => {
  const result = predictYield({ crop: 'Rice', areaInAcres: 6, soilPh: 6.4, nitrogenKgPerHa: 95 })
  assert.ok(result.lowerBound < result.expectedYield)
  assert.ok(result.expectedYield < result.upperBound)
  assert.ok(result.confidenceScore > 0 && result.confidenceScore < 1)
  assert.equal(typeof result.estimatedTreatmentAdvantage, 'number')
})

test('prediction becomes higher risk when field inputs are missing', () => {
  const result = predictYield({ crop: 'Wheat' })
  assert.equal(result.riskLevel, 'High')
  assert.ok(result.upperBound - result.lowerBound > 6)
})