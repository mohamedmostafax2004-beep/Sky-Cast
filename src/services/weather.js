const config = require('../config');

const POWER_FILL = -999;
const CACHE_SCHEMA = 'v2';

const cache = new Map();

function cacheKey(lat, lon, start, end) {
  return `${CACHE_SCHEMA}:${Number(lat).toFixed(4)},${Number(lon).toFixed(4)},${start},${end}`;
}

function sanitizeMetricMap(map, dates) {
  const out = {};
  dates.forEach((d) => {
    const v = map?.[d];
    if (v === POWER_FILL || v === -999 || v == null || Number.isNaN(Number(v))) {
      out[d] = null;
    } else {
      out[d] = Number(v);
    }
  });
  return out;
}

function finalizeWeatherPayload(data) {
  const dates = data.dates || [];
  return {
    ...data,
    dates,
    temps: sanitizeMetricMap(data.temps, dates),
    precs: sanitizeMetricMap(data.precs, dates),
    wspeed: sanitizeMetricMap(data.wspeed, dates),
    aod: sanitizeMetricMap(data.aod, dates),
    aodLatest:
      data.aodLatest &&
      data.aodLatest.value != null &&
      data.aodLatest.value !== POWER_FILL &&
      data.aodLatest.value !== -999
        ? { date: data.aodLatest.date, value: Number(data.aodLatest.value) }
        : null,
  };
}

function getDatesBetween(start, end) {
  const dates = [];
  let current = new Date(
    parseInt(start.substring(0, 4), 10),
    parseInt(start.substring(4, 6), 10) - 1,
    parseInt(start.substring(6, 8), 10)
  );
  const endDate = new Date(
    parseInt(end.substring(0, 4), 10),
    parseInt(end.substring(4, 6), 10) - 1,
    parseInt(end.substring(6, 8), 10)
  );
  while (current <= endDate) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const d = String(current.getDate()).padStart(2, '0');
    dates.push(`${y}${m}${d}`);
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getValue(paramObj, dateKey) {
  if (!paramObj) return null;
  let raw;
  if (paramObj[dateKey] !== undefined) raw = paramObj[dateKey];
  else {
    const formatted = `${dateKey.substring(0, 4)}-${dateKey.substring(4, 6)}-${dateKey.substring(6, 8)}`;
    if (paramObj[formatted] !== undefined) raw = paramObj[formatted];
    else if (Array.isArray(paramObj)) raw = paramObj[0] ?? null;
    else return null;
  }
  if (raw === POWER_FILL || raw === -999 || raw == null || Number.isNaN(Number(raw))) return null;
  return Number(raw);
}

function ymdToDate(ymd) {
  return new Date(
    parseInt(ymd.substring(0, 4), 10),
    parseInt(ymd.substring(4, 6), 10) - 1,
    parseInt(ymd.substring(6, 8), 10)
  );
}

function dateToYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function shiftYmd(ymd, days) {
  const d = ymdToDate(ymd);
  d.setDate(d.getDate() + days);
  return dateToYmd(d);
}

function shiftYear(ymd, yearOffset) {
  const d = ymdToDate(ymd);
  d.setFullYear(d.getFullYear() + yearOffset);
  return dateToYmd(d);
}

function formatDateString(ymd) {
  const y = ymd.substring(0, 4);
  const m = ymd.substring(4, 6);
  const d = ymd.substring(6, 8);
  return `${y}-${m}-${d}`;
}

async function fetchPowerParameters(lat, lon, start, end, parameters) {
  const url = `https://power.larc.nasa.gov/api/temporal/daily/point?start=${start}&end=${end}&latitude=${lat}&longitude=${lon}&community=AG&parameters=${parameters}&format=JSON`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA POWER responded ${res.status}`);
  const json = await res.json();
  if (json.messages?.length) {
    throw new Error(json.messages.join(' '));
  }
  return json.properties?.parameter || {};
}

function findLatestValidAod(params, dates) {
  for (let i = dates.length - 1; i >= 0; i--) {
    const date = dates[i];
    const v = getValue(params.AOD_55, date);
    if (v != null) return { date, value: v };
  }
  return null;
}

async function resolveAodFallback(lat, lon, userEnd) {
  const windowEnd = userEnd;
  const windowStart = shiftYmd(windowEnd, -120);
  try {
    const params = await fetchPowerParameters(lat, lon, windowStart, windowEnd, 'AOD_55');
    const dates = getDatesBetween(windowStart, windowEnd);
    const latest = findLatestValidAod(params, dates);
    if (latest) return latest;
  } catch {
    /* try older window */
  }

  const olderEnd = shiftYmd(userEnd, -150);
  const olderStart = shiftYmd(olderEnd, -90);
  try {
    const params = await fetchPowerParameters(lat, lon, olderStart, olderEnd, 'AOD_55');
    const dates = getDatesBetween(olderStart, olderEnd);
    return findLatestValidAod(params, dates);
  } catch {
    return null;
  }
}

async function fetch10YearAverage(lat, lon, start, end) {
  const dates = getDatesBetween(start, end);
  const temps = {};
  const precs = {};
  const wspeed = {};
  const aod = {};

  const sumTemps = {};
  const sumPrecs = {};
  const sumWspeed = {};
  const sumAod = {};
  const counts = {};

  dates.forEach((d) => {
    sumTemps[d] = 0;
    sumPrecs[d] = 0;
    sumWspeed[d] = 0;
    sumAod[d] = 0;
    counts[d] = { temp: 0, prec: 0, wind: 0, aod: 0 };
  });

  const yearsToFetch = 10;
  const promises = [];
  for (let i = 1; i <= yearsToFetch; i++) {
    const startYmd = shiftYear(start, -i);
    const endYmd = shiftYear(end, -i);
    promises.push(
      fetchPowerParameters(lat, lon, startYmd, endYmd, 'T2M,PRECTOTCORR,WS2M,AOD_55')
        .then((params) => ({ index: i, params }))
        .catch((err) => {
          console.warn(`Failed to fetch historical year -${i}:`, err.message);
          return null;
        })
    );
  }

  const results = await Promise.all(promises);

  dates.forEach((d) => {
    results.forEach((res) => {
      if (!res || !res.params) return;
      const { index, params } = res;
      const histYmd = shiftYear(d, -index);

      const t = getValue(params.T2M, histYmd);
      const p = getValue(params.PRECTOTCORR, histYmd);
      const w = getValue(params.WS2M, histYmd);
      const a = getValue(params.AOD_55, histYmd);

      if (t !== null) { sumTemps[d] += t; counts[d].temp++; }
      if (p !== null) { sumPrecs[d] += p; counts[d].prec++; }
      if (w !== null) { sumWspeed[d] += w; counts[d].wind++; }
      if (a !== null) { sumAod[d] += a; counts[d].aod++; }
    });
  });

  dates.forEach((d) => {
    temps[d] = counts[d].temp > 0 ? sumTemps[d] / counts[d].temp : null;
    precs[d] = counts[d].prec > 0 ? sumPrecs[d] / counts[d].prec : null;
    wspeed[d] = counts[d].wind > 0 ? sumWspeed[d] / counts[d].wind : null;
    aod[d] = counts[d].aod > 0 ? sumAod[d] / counts[d].aod : null;
  });

  return { dates, temps, precs, wspeed, aod };
}

async function fetchWeatherRange(lat, lon, userStart, userEnd) {
  const key = cacheKey(lat, lon, userStart, userEnd);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < config.weatherCacheTtlMs) {
    return { ...finalizeWeatherPayload(cached.data), cached: true };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thresholdDate = new Date(today.getTime() - 3 * 24 * 60 * 60 * 1000);
  const thresholdYmd = dateToYmd(thresholdDate);

  let data;

  if (userStart > thresholdYmd) {
    // Entire range is predicted using 10-year average
    const prediction = await fetch10YearAverage(lat, lon, userStart, userEnd);
    data = {
      ...prediction,
      predictionNotice: 'Weather forecast is simulated based on 10-year NASA POWER historical averages.',
      aodLatest: null,
      aodNotice: null,
      lat: String(lat),
      lon: String(lon),
      userStart,
      userEnd,
    };
  } else if (userEnd > thresholdYmd) {
    // Partial range: userStart to thresholdYmd is fetched, thresholdYmd + 1 to userEnd is predicted
    const pastEnd = thresholdYmd;
    const futureStart = shiftYmd(thresholdYmd, 1);

    let pastParams = null;
    try {
      pastParams = await fetchPowerParameters(lat, lon, userStart, pastEnd, 'T2M,PRECTOTCORR,WS2M,AOD_55');
    } catch (e) {
      console.warn('Failed to fetch past portion of weather range, will use prediction fallback:', e.message);
    }

    const prediction = await fetch10YearAverage(lat, lon, futureStart, userEnd);

    const dates = getDatesBetween(userStart, userEnd);
    const temps = {};
    const precs = {};
    const wspeed = {};
    const aod = {};

    dates.forEach((d) => {
      if (d <= pastEnd) {
        temps[d] = pastParams ? getValue(pastParams.T2M, d) : prediction.temps[d];
        precs[d] = pastParams ? getValue(pastParams.PRECTOTCORR, d) : prediction.precs[d];
        wspeed[d] = pastParams ? getValue(pastParams.WS2M, d) : prediction.wspeed[d];
        aod[d] = pastParams ? getValue(pastParams.AOD_55, d) : prediction.aod[d];
      } else {
        temps[d] = prediction.temps[d];
        precs[d] = prediction.precs[d];
        wspeed[d] = prediction.wspeed[d];
        aod[d] = prediction.aod[d];
      }
    });

    const hasAnyAod = dates.some((d) => aod[d] != null);
    let aodLatest = null;
    let aodNotice = null;
    if (!hasAnyAod) {
      aodLatest = await resolveAodFallback(lat, lon, userEnd);
      if (aodLatest) {
        aodNotice =
          'Air quality (AOD) is not published yet for your selected dates. Showing the latest available NASA reading below.';
      } else {
        aodNotice =
          'Air quality (AOD) is not available for this period from NASA POWER. Temperature, rain, and wind are still shown.';
      }
    }

    data = {
      dates,
      temps,
      precs,
      wspeed,
      aod,
      aodLatest,
      aodNotice,
      predictionNotice: `Some weather values (from ${formatDateString(futureStart)} onwards) are predicted based on a 10-year historical average.`,
      lat: String(lat),
      lon: String(lon),
      userStart,
      userEnd,
    };
  } else {
    // Entire range is in the past, query NASA POWER normally
    const params = await fetchPowerParameters(
      lat,
      lon,
      userStart,
      userEnd,
      'T2M,PRECTOTCORR,WS2M,AOD_55'
    );
    if (!params.T2M && !params.PRECTOTCORR) {
      throw new Error('No weather data for this location or date range.');
    }

    const dates = getDatesBetween(userStart, userEnd);
    const temps = {};
    const precs = {};
    const wspeed = {};
    const aod = {};

    dates.forEach((date) => {
      temps[date] = getValue(params.T2M, date);
      precs[date] = getValue(params.PRECTOTCORR, date);
      wspeed[date] = getValue(params.WS2M, date);
      aod[date] = getValue(params.AOD_55, date);
    });

    const hasAnyAod = dates.some((d) => aod[d] != null);
    let aodLatest = null;
    let aodNotice = null;
    if (!hasAnyAod) {
      aodLatest = await resolveAodFallback(lat, lon, userEnd);
      if (aodLatest) {
        aodNotice =
          'Air quality (AOD) is not published yet for your selected dates. Showing the latest available NASA reading below.';
      } else {
        aodNotice =
          'Air quality (AOD) is not available for this period from NASA POWER. Temperature, rain, and wind are still shown.';
      }
    }

    data = {
      dates,
      temps,
      precs,
      wspeed,
      aod,
      aodLatest,
      aodNotice,
      lat: String(lat),
      lon: String(lon),
      userStart,
      userEnd,
    };
  }

  const finalized = finalizeWeatherPayload(data);
  cache.set(key, { ts: Date.now(), data: finalized });
  return { ...finalized, cached: false };
}

module.exports = { fetchWeatherRange, getDatesBetween, POWER_FILL };
