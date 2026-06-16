// --- تحويل التاريخ من YYYYMMDD لصيغة مقروءة ---
function formatDate(yyyymmdd, lang = "en") {
  const year = yyyymmdd.substring(0, 4);
  const month = yyyymmdd.substring(4, 6);
  const day = yyyymmdd.substring(6, 8);
  const date = new Date(`${year}-${month}-${day}`);
  const options = { year: "numeric", month: "short", day: "numeric" };
  return date.toLocaleDateString(lang, options);
}

// --- Helper: generate all dates between start and end ---
function getDatesBetween(start, end) {
  const dates = [];
  let currentDate = new Date(
    parseInt(start.substring(0, 4)),
    parseInt(start.substring(4, 6)) - 1,
    parseInt(start.substring(6, 8))
  );
  const endDate = new Date(
    parseInt(end.substring(0, 4)),
    parseInt(end.substring(4, 6)) - 1,
    parseInt(end.substring(6, 8))
  );

  while (currentDate <= endDate) {
    const y = currentDate.getFullYear();
    const m = (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const d = currentDate.getDate().toString().padStart(2, "0");
    dates.push(`${y}${m}${d}`);
    currentDate.setDate(currentDate.getDate() + 1);
  }
  return dates;
}

// --- Get same day for past N years ---
function getPastYears(yyyymmdd, years) {
  const year = parseInt(yyyymmdd.substring(0, 4));
  const month = yyyymmdd.substring(4, 6);
  const day = yyyymmdd.substring(6, 8);
  const pastDates = [];
  for (let i = 1; i <= years; i++) {
    pastDates.push(`${year - i}${month}${day}`);
  }
  return pastDates;
}

// --- Safe extraction from NASA POWER response ---
function getValue(paramObj, dateKey) {
  if (!paramObj) return null;
  if (paramObj[dateKey] !== undefined) return paramObj[dateKey];
  const formatted = `${dateKey.substring(0,4)}-${dateKey.substring(4,6)}-${dateKey.substring(6,8)}`;
  if (paramObj[formatted] !== undefined) return paramObj[formatted];
  if (Array.isArray(paramObj)) return paramObj[0] ?? null;
  return null;
}

const POWER_FILL = -999;

function isValidPowerValue(v) {
  return v != null && v !== POWER_FILL && !Number.isNaN(Number(v));
}

function formatTemperature(v) {
  return isValidPowerValue(v) ? `${Number(v).toFixed(1)}°C` : 'N/A';
}

function formatPrecipitation(v) {
  return isValidPowerValue(v) ? `${Number(v)} mm` : 'N/A';
}

function formatWind(v) {
  return isValidPowerValue(v) ? `${Number(v).toFixed(1)} m/s` : 'N/A';
}

function formatAod(v) {
  return isValidPowerValue(v) ? Number(v).toFixed(3) : 'N/A';
}

// --- Analysis helpers ---
function analyzeTemperature(temp) {
  if (!isValidPowerValue(temp)) return "No Data";
  if (temp < 5) return "Very Low Temperature (Too Cold)";
  if (temp < 15) return "Low Temperature";
  if (temp < 30) return "Normal Temperature";
  if (temp < 38) return "High Temperature";
  return "Very High Temperature (Extreme Heat)";
}

function analyzeWind(wind) {
  if (!isValidPowerValue(wind)) return "No Data";
  if (wind < 1) return "Very Low Wind";
  if (wind < 3) return "Low Wind";
  if (wind < 7) return "Normal Wind";
  if (wind < 12) return "High Wind";
  return "Very High Wind";
}

function analyzePrecipitation(prec) {
  if (!isValidPowerValue(prec)) return "No Data";
  if (prec === 0) return "No Rain";
  if (prec <= 5) return "Light Rain";
  if (prec <= 20) return "Moderate Rain";
  return "Heavy Rain";
}

function analyzeAOD(aod) {
  if (!isValidPowerValue(aod)) return "No Data";
  if (aod < 0.1) return "Very Clean Air";
  if (aod < 0.3) return "Low Aerosol";
  if (aod < 0.7) return "Moderate Aerosol";
  if (aod <= 1.0) return "High Aerosol";
  return "Very High Aerosol (Air Quality Alert)";
}

// --- Loading Overlay Helpers ---
function showLoadingBox() {
  const div = document.createElement("div");
  div.id = "custom-loading-box";
  div.innerHTML = `
    <div style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 9998; backdrop-filter: blur(3px);"></div>
    <div style="position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%); background: white; padding: 25px 50px; border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.2); z-index: 9999; display: flex; align-items: center; gap: 15px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; font-size: 20px; font-weight: bold; color: #472dbb; border: 2px solid #472dbb;">
      <i class="fas fa-spinner fa-spin"></i> loading...
    </div>
  `;
  document.body.appendChild(div);
}

function hideLoadingBox() {
  const box = document.getElementById("custom-loading-box");
  if (box) box.remove();
}

// --- Show results in modal ---
function showWeatherModal(location, start, end, temps, precs, wspeed, aod, meta = {}) {
  let content = '';
  if (meta.predictionNotice) {
    content += `<div class="alert alert-warning py-2 small mb-3" role="status"><i class="fas fa-magic"></i> ${meta.predictionNotice}</div>`;
  }
  if (meta.aodNotice) {
    content += `<div class="alert alert-info py-2 small mb-3" role="status"><i class="fas fa-info-circle"></i> ${meta.aodNotice}</div>`;
  }
  content += `
    <div class="weather-header-info">
      <div class="location-info">
        <i class="fas fa-map-marker-alt text-primary"></i>
        <span class="location-text"><strong>Location:</strong> ${location}</span>
      </div>
      <div class="date-range-info">
        <i class="fas fa-calendar-alt text-info"></i>
        <span class="date-text"><strong>Period:</strong> ${formatDate(start)} → ${formatDate(end)}</span>
      </div>
    </div>
    <hr class="weather-divider">
    <div class="weather-data-section">
      <h5 class="section-title">
        <i class="fas fa-chart-line text-primary"></i>
        Daily Weather Analysis
      </h5>
  `;

  const dayKeys = (meta.sortedDates || Object.keys(temps)).slice().sort();
  for (const day of dayKeys) {
    const t = temps[day];
    const p = precs[day];
    const w = wspeed[day];
    const a = aod[day];
    const tempIcon = getTemperatureIcon(t);
    const precipIcon = getPrecipitationIcon(p);
    const windIcon = getWindIcon(w);
    const aodIcon = getAODIcon(isValidPowerValue(a) ? a : meta.aodLatest?.value);
    const hasCore = isValidPowerValue(t) || isValidPowerValue(p) || isValidPowerValue(w);
    const hasAod = isValidPowerValue(a);
    const dayStatus = hasCore && hasAod
      ? { icon: 'fa-check-circle text-success', text: 'Data Available' }
      : hasCore
        ? { icon: 'fa-exclamation-circle text-warning', text: 'Partial Data' }
        : { icon: 'fa-times-circle text-danger', text: 'No Data' };

    content += `
      <div class="weather-day-card">
        <div class="day-header">
          <i class="fas fa-calendar-day text-primary"></i>
          <span class="day-date">${formatDate(day, "en")}</span>
          <div class="day-status">
            <i class="fas ${dayStatus.icon}"></i>
            <span>${dayStatus.text}</span>
          </div>
        </div>
        
        <div class="weather-metrics-grid">
          <div class="metric-card temperature-card">
            <div class="metric-header">
              <i class="${tempIcon}"></i>
              <span class="metric-label">Temperature</span>
            </div>
            <div class="metric-value">${formatTemperature(t)}</div>
            <div class="metric-analysis">${analyzeTemperature(t)}</div>
          </div>

          <div class="metric-card precipitation-card">
            <div class="metric-header">
              <i class="${precipIcon}"></i>
              <span class="metric-label">Precipitation</span>
            </div>
            <div class="metric-value">${formatPrecipitation(p)}</div>
            <div class="metric-analysis">${analyzePrecipitation(p)}</div>
          </div>

          <div class="metric-card wind-card">
            <div class="metric-header">
              <i class="${windIcon}"></i>
              <span class="metric-label">Wind Speed</span>
            </div>
            <div class="metric-value">${formatWind(w)}</div>
            <div class="metric-analysis">${analyzeWind(w)}</div>
          </div>

          <div class="metric-card air-quality-card">
            <div class="metric-header">
              <i class="${aodIcon}"></i>
              <span class="metric-label">Air Quality</span>
            </div>
            <div class="metric-value">${isValidPowerValue(a) ? formatAod(a) : meta.aodLatest ? formatAod(meta.aodLatest.value) : 'N/A'}</div>
            <div class="metric-analysis">${isValidPowerValue(a) ? analyzeAOD(a) : meta.aodLatest ? analyzeAOD(meta.aodLatest.value) + ' (latest available)' : analyzeAOD(a)}</div>
            ${!isValidPowerValue(a) && meta.aodLatest ? `<div class="metric-hint small text-muted mt-1">As of ${formatDate(meta.aodLatest.date, 'en')} — not yet published for selected date</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }

  content += `
    </div>
    <div class="weather-summary">
      <div class="summary-card">
        <i class="fas fa-info-circle text-info"></i>
        <span>Data provided by NASA POWER API for the selected date range</span>
      </div>
    </div>
  `;

  document.getElementById("weatherModalBody").innerHTML = content;
  const modal = new bootstrap.Modal(document.getElementById("weatherModal"));
  modal.show();
}

// Helper functions for weather icons
function getTemperatureIcon(temp) {
  if (!isValidPowerValue(temp)) return "fas fa-question-circle text-muted";
  if (temp < 5) return "fas fa-thermometer-empty text-info";
  if (temp < 15) return "fas fa-thermometer-quarter text-primary";
  if (temp < 30) return "fas fa-thermometer-half text-success";
  if (temp < 38) return "fas fa-thermometer-three-quarters text-warning";
  return "fas fa-thermometer-full text-danger";
}

function getPrecipitationIcon(precip) {
  if (!isValidPowerValue(precip)) return "fas fa-question-circle text-muted";
  if (precip === 0) return "fas fa-sun text-warning";
  if (precip <= 5) return "fas fa-cloud-rain text-info";
  if (precip <= 20) return "fas fa-cloud-rain text-primary";
  return "fas fa-cloud-showers-heavy text-danger";
}

function getWindIcon(wind) {
  if (!isValidPowerValue(wind)) return "fas fa-question-circle text-muted";
  if (wind < 1) return "fas fa-wind text-muted";
  if (wind < 3) return "fas fa-wind text-info";
  if (wind < 7) return "fas fa-wind text-primary";
  if (wind < 12) return "fas fa-wind text-warning";
  return "fas fa-wind text-danger";
}

function getAODIcon(aod) {
  if (!isValidPowerValue(aod)) return "fas fa-question-circle text-muted";
  if (aod < 0.1) return "fas fa-leaf text-success";
  if (aod < 0.3) return "fas fa-leaf text-info";
  if (aod < 0.7) return "fas fa-leaf text-warning";
  if (aod <= 1.0) return "fas fa-leaf text-danger";
  return "fas fa-exclamation-triangle text-danger";
}

// --- Chart state ---
let lastWeatherChartData = null;
let temperatureChartInstance = null;
let precipitationChartInstance = null;
let windChartInstance = null;
let aodChartInstance = null;

function updateWeatherLocationDisplay() {
  const el = document.getElementById('weatherSelectedLocation');
  if (!el) return;
  if (typeof selectedLat !== 'undefined' && selectedLat && selectedLon) {
    const place = window.selectedPlaceName;
    el.textContent = place ? `${place} (${selectedLat}, ${selectedLon})` : `${selectedLat}, ${selectedLon}`;
    el.classList.remove('text-muted');
    if (!place && typeof resolvePlaceName === 'function') {
      resolvePlaceName(selectedLat, selectedLon);
    }
  } else {
    el.textContent = 'Click the map or right-click a point to select a location';
    el.classList.add('text-muted');
  }
}

async function fetchNASAPowerRange(lat, lon, userStart, userEnd) {
  if (typeof SkyCastAPI !== 'undefined') {
    const data = await SkyCastAPI.getWeather(lat, lon, userStart, userEnd);
    return {
      dates: data.dates,
      temps: data.temps,
      precs: data.precs,
      wspeed: data.wspeed,
      aod: data.aod,
      aodLatest: data.aodLatest,
      aodNotice: data.aodNotice,
      lat: data.lat,
      lon: data.lon,
      userStart: data.userStart,
      userEnd: data.userEnd,
    };
  }
  throw new Error('API client not loaded');
}

function getActiveChartPeriodDays() {
  const active = document.querySelector('.chart-controls [data-period].active');
  const period = active?.dataset.period || '7d';
  if (period === '30d') return 30;
  if (period === '1y') return 365;
  return 7;
}

function filterChartDataByPeriod(data) {
  const days = getActiveChartPeriodDays();
  const dates = data.dates.slice(-days);
  return {
    ...data,
    dates,
    temps: pickDates(data.temps, dates),
    precs: pickDates(data.precs, dates),
    wspeed: pickDates(data.wspeed, dates),
    aod: pickDates(data.aod, dates)
  };
}

function pickDates(source, dates) {
  const out = {};
  dates.forEach((d) => { out[d] = source[d]; });
  return out;
}

function chartLabels(dates) {
  return dates.map((d) => formatDate(d, 'en'));
}

function destroyChart(instance) {
  if (instance) instance.destroy();
  return null;
}

function showChartMessage(containerId, message, isError) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const parent = container.parentElement;
  const placeholder = parent?.querySelector('.chart-placeholder');
  if (placeholder) {
    placeholder.style.display = 'flex';
    placeholder.querySelector('p').textContent = message;
    placeholder.classList.toggle('chart-error', !!isError);
  }
  container.style.display = 'none';
}

function hideChartPlaceholder(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const placeholder = container.parentElement?.querySelector('.chart-placeholder');
  if (placeholder) placeholder.style.display = 'none';
  container.style.display = 'block';
}

function renderWeatherCharts(data) {
  if (typeof Chart === 'undefined') {
    console.warn('Chart.js not loaded');
    return;
  }

  const filtered = filterChartDataByPeriod(data);
  const labels = chartLabels(filtered.dates);
  const tempValues = filtered.dates.map((d) => {
    const v = filtered.temps[d];
    if (!isValidPowerValue(v)) return null;
    const display = typeof celsiusToDisplay === 'function' ? celsiusToDisplay(v) : v;
    return Number(display.toFixed(1));
  });
  const precipValues = filtered.dates.map((d) => {
    const v = filtered.precs[d];
    if (!isValidPowerValue(v)) return null;
    const display = typeof mmToDisplay === 'function' ? mmToDisplay(v) : v;
    return Number(display.toFixed(2));
  });
  const windValues = filtered.dates.map((d) => {
    const v = filtered.wspeed[d];
    return isValidPowerValue(v) ? Number(v.toFixed(1)) : null;
  });
  const aodValues = filtered.dates.map((d) => {
    const v = filtered.aod[d];
    return isValidPowerValue(v) ? Number(v.toFixed(3)) : null;
  });
  const tempLabel = typeof tempUnitLabel === 'function' ? tempUnitLabel() : '°C';
  const precipLabel = typeof precipUnitLabel === 'function' ? precipUnitLabel() : 'mm';

  const tempCanvas = document.getElementById('temperatureChart');
  const precipCanvas = document.getElementById('precipitationChart');
  const windCanvas = document.getElementById('windChart');
  const aodCanvas = document.getElementById('aodChart');

  if (!tempCanvas || !precipCanvas) return;

  if (!labels.length) {
    showChartMessage('temperatureChart', 'No temperature data for this period.', true);
    showChartMessage('precipitationChart', 'No precipitation data for this period.', true);
    return;
  }

  const hasTemp = tempValues.some((v) => v != null);
  const hasPrecip = precipValues.some((v) => v != null);
  const hasWind = windValues.some((v) => v != null);

  if (!hasTemp) {
    temperatureChartInstance = destroyChart(temperatureChartInstance);
    showChartMessage(
      'temperatureChart',
      'No temperature data for these dates. Try an earlier range (NASA POWER may lag for recent days).',
      true
    );
  } else {
    hideChartPlaceholder('temperatureChart');
  }

  if (!hasPrecip) {
    precipitationChartInstance = destroyChart(precipitationChartInstance);
    showChartMessage('precipitationChart', 'No precipitation data for this period.', true);
  } else {
    hideChartPlaceholder('precipitationChart');
  }

  windChartInstance = destroyChart(windChartInstance);
  aodChartInstance = destroyChart(aodChartInstance);

  const isDark = document.body.classList.contains('dark-mode');
  const gridColor = isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)';
  const textColor = isDark ? '#e2e8f0' : '#334155';

  if (hasTemp) {
  temperatureChartInstance = destroyChart(temperatureChartInstance);
  temperatureChartInstance = new Chart(tempCanvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Temperature (${tempLabel})`,
        data: tempValues,
        borderColor: '#667eea',
        backgroundColor: 'rgba(102, 126, 234, 0.15)',
        fill: true,
        tension: 0.35,
        pointRadius: 3,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
        y: { title: { display: true, text: tempLabel, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor } }
      }
    }
  });
  }

  const precipType = document.querySelector('.chart-controls [data-type].active')?.dataset.type || 'rain';
  if (hasPrecip) {
  precipitationChartInstance = destroyChart(precipitationChartInstance);
  precipitationChartInstance = new Chart(precipCanvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: precipType === 'snow' ? `Precipitation (${precipLabel}, liquid equiv.)` : `Precipitation (${precipLabel})`,
        data: precipValues,
        backgroundColor: precipType === 'snow'
          ? 'rgba(116, 185, 255, 0.65)'
          : 'rgba(71, 45, 187, 0.65)',
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: textColor } } },
      scales: {
        x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
        y: { title: { display: true, text: precipLabel, color: textColor }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true }
      }
    }
  });
  }

  if (windCanvas) {
    windChartInstance = destroyChart(windChartInstance);
    if (!hasWind) {
      showChartMessage('windChart', 'No wind data for this period.', false);
    } else {
    hideChartPlaceholder('windChart');
    windChartInstance = new Chart(windCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Wind (m/s)',
          data: windValues,
          borderColor: '#00b894',
          backgroundColor: 'rgba(0, 184, 148, 0.12)',
          fill: true,
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
          y: { title: { display: true, text: 'm/s', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });
    }
  }

  if (aodCanvas) {
    aodChartInstance = destroyChart(aodChartInstance);
    if (!aodValues.some((v) => v != null)) {
      const aodMsg = data.aodNotice || 'No air quality (AOD) data for this period.';
      showChartMessage('aodChart', aodMsg, false);
    } else {
    hideChartPlaceholder('aodChart');
    aodChartInstance = new Chart(aodCanvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'AOD (air quality proxy)',
          data: aodValues,
          borderColor: '#e17055',
          backgroundColor: 'rgba(225, 112, 85, 0.12)',
          fill: true,
          tension: 0.3,
          spanGaps: true,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor, maxRotation: 45 }, grid: { color: gridColor } },
          y: { title: { display: true, text: 'AOD', color: textColor }, ticks: { color: textColor }, grid: { color: gridColor }, beginAtZero: true },
        },
      },
    });
    }
  }
}

function updateWeatherFeatureSummary(data) {
  const validTemps = data.dates.map((d) => data.temps[d]).filter((v) => isValidPowerValue(v));
  const validPrecs = data.dates.map((d) => data.precs[d]).filter((v) => isValidPowerValue(v));
  const validAod = data.dates.map((d) => data.aod[d]).filter((v) => isValidPowerValue(v));
  const avgTemp = validTemps.length
    ? (validTemps.reduce((a, b) => a + b, 0) / validTemps.length).toFixed(1)
    : '—';
  const totalPrecip = validPrecs.length
    ? validPrecs.reduce((a, b) => a + b, 0).toFixed(1)
    : '—';

  const banner = document.querySelector('.weather-status-banner .status-content span');
  if (banner) {
    banner.textContent = `Location ${data.lat}, ${data.lon} — Avg temp ${avgTemp}°C, total precip ${totalPrecip} mm (${formatDate(data.userStart)} → ${formatDate(data.userEnd)})`;
  }

  document.querySelectorAll('.weather-feature-card').forEach((card) => {
    const feature = card.dataset.feature;
    const p = card.querySelector('.feature-content p');
    if (!p) return;
    if (feature === 'temperature' && validTemps.length) {
      p.textContent = `Avg ${avgTemp}°C over selected period`;
    } else if (feature === 'precipitation' && validPrecs.length) {
      p.textContent = `Total ${totalPrecip} mm in selected period`;
    } else if (feature === 'wind') {
      const validWind = data.dates.map((d) => data.wspeed[d]).filter((v) => isValidPowerValue(v));
      if (validWind.length) {
        const avg = (validWind.reduce((a, b) => a + b, 0) / validWind.length).toFixed(1);
        p.textContent = `Avg wind ${avg} m/s (${validWind.length} day(s))`;
      }
    } else if (feature === 'air-quality') {
      if (validAod.length) {
        const avg = (validAod.reduce((a, b) => a + b, 0) / validAod.length).toFixed(3);
        p.textContent = `Avg AOD ${avg} (${validAod.length} day(s))`;
      } else if (data.aodLatest) {
        p.textContent = `Latest AOD ${formatAod(data.aodLatest.value)} — ${formatDate(data.aodLatest.date, 'en')}`;
      } else {
        p.textContent = 'AOD not available for this date range';
      }
    }
  });
}

function refreshWeatherChartsFromControls() {
  if (!lastWeatherChartData) return;
  renderWeatherCharts(lastWeatherChartData);
}

function exportLastWeatherData() {
  if (typeof downloadWeatherPdf === 'function') {
    downloadWeatherPdf();
    return;
  }
  if (!lastWeatherChartData) {
    if (typeof showNotification === 'function') {
      showNotification('Load weather data first using Get Weather Data.', 'info');
    }
    return;
  }
  const blob = new Blob([JSON.stringify(lastWeatherChartData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `weather-${lastWeatherChartData.lat}-${lastWeatherChartData.userStart}-${lastWeatherChartData.userEnd}.json`;
  a.click();
  URL.revokeObjectURL(url);
  if (typeof showNotification === 'function') {
    showNotification('Weather data exported as JSON.', 'success');
  }
}

// --- Main logic: Fetch weather data with 10-year average ---
async function fetchWeatherDataWith10YearAverage(lat, lon, userStart, userEnd, options = {}) {
  const { showDetailModal = true, updateCharts = true } = options;
  showLoadingBox();
  try {
    const rangeData = await fetchNASAPowerRange(lat, lon, userStart, userEnd);
    lastWeatherChartData = rangeData;

    if (updateCharts) {
      updateWeatherLocationDisplay();
      updateWeatherFeatureSummary(rangeData);
      renderWeatherCharts(rangeData);
      if (typeof checkWeatherAlerts === 'function') checkWeatherAlerts(rangeData);
    }
    window.lastLoadedWeatherSummary = rangeData;

    if (showDetailModal) {
      showWeatherModal(
        `${lat}, ${lon}`,
        userStart,
        userEnd,
        rangeData.temps,
        rangeData.precs,
        rangeData.wspeed,
        rangeData.aod,
        {
          aodNotice: rangeData.aodNotice,
          aodLatest: rangeData.aodLatest,
          sortedDates: rangeData.dates,
          predictionNotice: rangeData.predictionNotice,
        }
      );
    }

    if (typeof showNotification === 'function') {
      showNotification('Weather data loaded successfully.', 'success');
    }
  } catch (error) {
    console.error('Error fetching weather data:', error);
    const msg = error.message || 'An error occurred while fetching weather data.';
    if (updateCharts) {
      showChartMessage('temperatureChart', msg, true);
      showChartMessage('precipitationChart', msg, true);
    }
    if (typeof showNotification === 'function') {
      showNotification(msg, 'error');
    } else {
      alert(msg);
    }
  } finally {
    hideLoadingBox();
  }
}

document.addEventListener('DOMContentLoaded', updateWeatherLocationDisplay);
