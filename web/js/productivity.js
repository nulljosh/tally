(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.TallyProductivity = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function monthKeyFromDate(date) {
    const d = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    return year + '-' + month;
  }

  function normalizeRating(value) {
    const num = Number(value);
    if (!Number.isFinite(num)) return 0;
    const rounded = Math.round(num);
    if (rounded < 1 || rounded > 5) return 0;
    return rounded;
  }

  function sanitizeEntry(entry) {
    const safeEntry = entry || {};
    const ratings = safeEntry.ratings || {};
    return {
      monthKey: String(safeEntry.monthKey || '').trim(),
      ratings: {
        mood: normalizeRating(ratings.mood),
        focus: normalizeRating(ratings.focus),
        energy: normalizeRating(ratings.energy)
      },
      note: String(safeEntry.note || '').trim(),
      savedAt: safeEntry.savedAt || new Date().toISOString()
    };
  }

  function byMonthDesc(a, b) {
    return b.monthKey.localeCompare(a.monthKey);
  }

  function upsertCheckin(checkins, nextEntry) {
    const list = Array.isArray(checkins) ? checkins.slice() : [];
    const entry = sanitizeEntry(nextEntry);
    if (!entry.monthKey) return list.sort(byMonthDesc);

    const idx = list.findIndex(function (item) {
      return item && item.monthKey === entry.monthKey;
    });

    if (idx >= 0) list[idx] = entry;
    else list.push(entry);

    return list.sort(byMonthDesc);
  }

  function findByMonth(checkins, monthKey) {
    if (!Array.isArray(checkins) || !monthKey) return null;
    return checkins.find(function (entry) {
      return entry && entry.monthKey === monthKey;
    }) || null;
  }

  function findPrevious(checkins, currentMonthKey) {
    if (!Array.isArray(checkins) || !currentMonthKey) return null;
    const sorted = checkins.slice().sort(byMonthDesc);
    const idx = sorted.findIndex(function (entry) {
      return entry && entry.monthKey === currentMonthKey;
    });
    if (idx < 0 || idx === sorted.length - 1) return null;
    return sorted[idx + 1] || null;
  }

  function calculateMetricDelta(current, previous) {
    const cur = normalizeRating(current);
    const prev = normalizeRating(previous);
    if (!cur || !prev) {
      return { delta: 0, direction: 'flat', formatted: '0', hasBaseline: false };
    }
    const diff = cur - prev;
    const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
    const sign = diff > 0 ? '+' : '';
    return {
      delta: diff,
      direction: direction,
      formatted: sign + String(diff),
      hasBaseline: true
    };
  }

  function roundToTenth(value) {
    return Math.round(value * 10) / 10;
  }

  function averageRatings(ratings) {
    if (!ratings) return 0;
    const values = ['mood', 'focus', 'energy']
      .map(function (key) { return normalizeRating(ratings[key]); })
      .filter(function (v) { return v > 0; });
    if (values.length === 0) return 0;
    const sum = values.reduce(function (acc, item) { return acc + item; }, 0);
    return roundToTenth(sum / values.length);
  }

  function calculateCheckinDelta(currentEntry, previousEntry) {
    const current = sanitizeEntry(currentEntry);
    const previous = previousEntry ? sanitizeEntry(previousEntry) : null;

    const metrics = {
      mood: calculateMetricDelta(current.ratings.mood, previous && previous.ratings.mood),
      focus: calculateMetricDelta(current.ratings.focus, previous && previous.ratings.focus),
      energy: calculateMetricDelta(current.ratings.energy, previous && previous.ratings.energy)
    };

    const currentAverage = averageRatings(current.ratings);
    const previousAverage = previous ? averageRatings(previous.ratings) : 0;
    const averageDelta = previousAverage ? roundToTenth(currentAverage - previousAverage) : 0;
    const trend = averageDelta > 0 ? 'up' : averageDelta < 0 ? 'down' : 'flat';

    return {
      metrics: metrics,
      average: {
        current: currentAverage,
        previous: previousAverage,
        delta: averageDelta,
        trend: trend,
        formatted: (averageDelta > 0 ? '+' : '') + String(averageDelta)
      }
    };
  }

  return {
    monthKeyFromDate: monthKeyFromDate,
    normalizeRating: normalizeRating,
    sanitizeEntry: sanitizeEntry,
    upsertCheckin: upsertCheckin,
    findByMonth: findByMonth,
    findPrevious: findPrevious,
    calculateMetricDelta: calculateMetricDelta,
    calculateCheckinDelta: calculateCheckinDelta,
    averageRatings: averageRatings
  };
}));
