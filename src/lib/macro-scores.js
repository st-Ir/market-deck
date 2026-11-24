const modelKeys = ['liquidity', 'growth', 'inflation', 'risk'];
const minimumIndicators = 2;
const minimumCoverage = 60;
const DAY = 86_400_000;
const validScore = (value) => Number.isFinite(value) && value >= 0 && value <= 100;
const sufficientCoverage = (count, coverage) => count >= minimumIndicators && coverage >= minimumCoverage;
const clampScore = (score) => Math.max(0, Math.min(100, score));

function scoreHistory(indicators, totalWeight) {
  const series = indicators.filter((row) => row.weight > 0 && row.history?.length).map((row) => ({
    weight: row.weight,
    maxAge: (row.historyMaxAgeDays ?? 0) * DAY,
    points: row.history,
    cursor: -1,
  }));
  const dates = [...new Set(series.flatMap(({ points }) => points.map((point) => point.date)))].sort();
  const history = dates.map((date) => {
    const time = Date.parse(date);
    let availableWeight = 0;
    let availableIndicators = 0;
    let weighted = 0;
    for (const row of series) {
      while (row.points[row.cursor + 1]?.date <= date) row.cursor++;
      const point = row.points[row.cursor];
      if (!point || !validScore(point.score) || !Number.isFinite(point.value) || time - Date.parse(point.date) > row.maxAge) continue;
      availableIndicators++;
      availableWeight += row.weight;
      weighted += row.weight * point.score;
    }
    const coverage = availableWeight / totalWeight * 100;
    const score = sufficientCoverage(availableIndicators, coverage) ? clampScore(weighted / availableWeight) : null;
    return { date, score, availableIndicators, coverage };
  });
  const first = history.findIndex((point) => point.score !== null);
  return first >= 0 ? history.slice(first) : [];
}

function scoreForecast(forecast, totalWeight, history) {
  if (!forecast || totalWeight <= 0) return null;
  const lastActual = history.findLast((point) => validScore(point.score))?.date;
  const periods = forecast.periods.filter(({ date }) => !lastActual || date > lastActual).map((period) => {
    const { indicators } = period;
    const included = (row) => validScore(row.score) && row.weight > 0;
    const available = indicators.filter(included);
    const availableWeight = available.reduce((sum, row) => sum + row.weight, 0);
    const coverage = availableWeight / totalWeight * 100;
    const reason = period.reason || (!sufficientCoverage(available.length, coverage)
      ? `Skor memerlukan minimal ${minimumIndicators} indikator dan ${minimumCoverage}% bobot awal tersedia.` : null);
    const score = reason ? null : clampScore(available.reduce((sum, row) => sum + row.score * row.weight, 0) / availableWeight);
    return {
      ...period,
      score,
      reason,
      availableWeight,
      coverage,
      availableIndicators: available.length,
      indicators: indicators.map((row) => {
        const effectiveWeight = score !== null && included(row) ? row.weight / availableWeight * 100 : null;
        return { ...row, effectiveWeight, contribution: effectiveWeight === null ? null : row.score * effectiveWeight / 100 };
      }),
    };
  });
  const points = periods.filter(({ score }) => validScore(score)).map(({ date, updatedAt, score }) => ({ date, updatedAt, score }));
  return periods.length ? { source: forecast.source, sourceUrl: forecast.sourceUrl, note: forecast.note, periods, points } : null;
}

function scoreModel(model) {
  const indicators = model?.indicators ?? [];
  const included = (indicator) => Number.isFinite(indicator.value)
    && validScore(indicator.score)
    && Number.isFinite(Date.parse(indicator.asOf)) && indicator.weight > 0;
  const available = indicators.filter(included);
  const totalWeight = indicators.reduce((sum, indicator) => sum + indicator.weight, 0);
  const availableWeight = available.reduce((sum, indicator) => sum + indicator.weight, 0);
  const coverage = totalWeight > 0 ? availableWeight / totalWeight * 100 : 0;
  const sufficient = sufficientCoverage(available.length, coverage);
  const dates = available.map((indicator) => indicator.asOf).sort();
  const history = scoreHistory(indicators, totalWeight);
  const contributions = indicators.map((indicator) => {
    const effectiveWeight = sufficient && included(indicator) ? indicator.weight / availableWeight * 100 : null;
    return {
      ...indicator,
      effectiveWeight,
      contribution: effectiveWeight === null ? null : indicator.score * effectiveWeight / 100,
    };
  });
  return {
    scope: model?.scope ?? null,
    note: model?.note ?? null,
    score: sufficient ? clampScore(contributions.reduce((sum, row) => sum + (row.contribution ?? 0), 0)) : null,
    status: !sufficient ? 'unavailable' : available.length === indicators.length ? 'ready' : 'partial',
    asOf: dates.at(-1) ?? null,
    availableIndicators: available.length,
    availableWeight,
    coverage,
    indicators: contributions,
    history,
    forecast: scoreForecast(model?.forecast, totalWeight, history),
  };
}

export function macroScores(models, now = new Date()) {
  return {
    schema: 1,
    generatedAt: now.toISOString(),
    rules: { minimumIndicators, minimumCoverage },
    models: Object.fromEntries(modelKeys.map((key) => [key, scoreModel(models[key])])),
  };
}
