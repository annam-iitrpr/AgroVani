import core from './prediction-core.cjs'

export function predictYield(input = {}) {
  const result = core.predictYield(input)
  return {
    ...result,
    model: 'Baseline observational regression placeholder', modelStatus: 'not trained',
    explanation: 'Model-based estimate from crop, soil, and nutrient inputs. This is not causal attribution or proof that treatment caused the difference.',
    metrics: { mae: null, rmse: null, calibrationError: null, note: 'Backtest metrics appear after a trained model is connected.' },
    dataFreshness: new Date().toISOString(),
  }
}