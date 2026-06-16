/**
 * SkyCast A+ enhancements: share URLs, presets, units, alerts, onboarding, search→weather
 */
(function () {
  const PREFS_KEY = 'skycast_prefs';
  const MAP_STATE_KEY = 'skycast_map_state';
  const ONBOARD_KEY = 'skycast_onboard_done';

  window.skycastPrefs = loadPrefs();
  window.selectedPlaceName = window.selectedPlaceName || null;

  function loadPrefs() {
    try {
      return { units: 'metric', ...JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') };
    } catch {
      return { units: 'metric' };
    }
  }

  function savePrefs() {
    localStorage.setItem(PREFS_KEY, JSON.stringify(window.skycastPrefs));
  }

  window.celsiusToDisplay = function (c) {
    if (c == null || c === -999 || Number.isNaN(Number(c))) return null;
    if (window.skycastPrefs.units === 'imperial') return (c * 9) / 5 + 32;
    return c;
  };

  window.tempUnitLabel = function () {
    return window.skycastPrefs.units === 'imperial' ? '°F' : '°C';
  };

  window.mmToDisplay = function (mm) {
    if (mm == null || mm === -999 || Number.isNaN(Number(mm))) return null;
    if (window.skycastPrefs.units === 'imperial') return mm / 25.4;
    return mm;
  };

  window.precipUnitLabel = function () {
    return window.skycastPrefs.units === 'imperial' ? 'in' : 'mm';
  };

  window.toggleUnits = function () {
    window.skycastPrefs.units = window.skycastPrefs.units === 'metric' ? 'imperial' : 'metric';
    savePrefs();
    const btn = document.getElementById('unitsToggleBtn');
    if (btn) btn.textContent = window.skycastPrefs.units === 'imperial' ? '°F / in' : '°C / mm';
    if (typeof refreshWeatherChartsFromControls === 'function' && lastWeatherChartData) {
      refreshWeatherChartsFromControls();
    }
    if (typeof showNotification === 'function') {
      showNotification(`Units: ${window.skycastPrefs.units}`, 'info');
    }
  };

  window.applyDatePreset = function (preset) {
    const startInput = document.getElementById('weatherStartDate');
    const endInput = document.getElementById('weatherEndDate');
    if (!startInput || !endInput) return;
    const end = new Date();
    const start = new Date();
    if (preset === '7d') start.setDate(end.getDate() - 7);
    else if (preset === '30d') start.setDate(end.getDate() - 30);
    else if (preset === '1y') start.setFullYear(end.getFullYear() - 1);
    else if (preset === 'ytd') start.setMonth(0, 1);
    startInput.value = start.toISOString().split('T')[0];
    endInput.value = end.toISOString().split('T')[0];
  };

  window.shareWeatherView = function () {
    const lat = typeof selectedLat !== 'undefined' ? selectedLat : null;
    const lon = typeof selectedLon !== 'undefined' ? selectedLon : null;
    const start = document.getElementById('weatherStartDate')?.value;
    const end = document.getElementById('weatherEndDate')?.value;
    const params = new URLSearchParams();
    if (lat) params.set('lat', lat);
    if (lon) params.set('lon', lon);
    if (start) params.set('start', start);
    if (end) params.set('end', end);
    if (window.selectedPlaceName) params.set('place', window.selectedPlaceName);
    const url = `${location.origin}${location.pathname}?${params}`;
    navigator.clipboard.writeText(url).then(() => {
      if (typeof showNotification === 'function') showNotification('Share link copied to clipboard!', 'success');
    }).catch(() => prompt('Copy this link:', url));
  };

  function parseUrlParams() {
    const p = new URLSearchParams(location.search);
    const lat = p.get('lat');
    const lon = p.get('lon');
    if (lat && lon) {
      window.selectedLat = parseFloat(lat).toFixed(6);
      window.selectedLon = parseFloat(lon).toFixed(6);
      if (p.get('place')) window.selectedPlaceName = p.get('place');
    }
    return { lat, lon, start: p.get('start'), end: p.get('end'), openWeather: p.get('weather') === '1' };
  }

  window.saveMapState = function () {
    if (typeof map === 'undefined') return;
    const c = map.getCenter();
    localStorage.setItem(MAP_STATE_KEY, JSON.stringify({
      lat: c.lat,
      lng: c.lng,
      zoom: map.getZoom(),
    }));
  };

  window.restoreMapState = function () {
    try {
      const s = JSON.parse(localStorage.getItem(MAP_STATE_KEY) || 'null');
      if (s && typeof map !== 'undefined') map.setView([s.lat, s.lng], s.zoom);
    } catch { /* ignore */ }
  };

  window.resolvePlaceName = async function (lat, lon) {
    try {
      const data = await SkyCastAPI.reverseGeocode(lat, lon);
      window.selectedPlaceName = data.name;
      if (typeof updateWeatherLocationDisplay === 'function') updateWeatherLocationDisplay();
      return data.name;
    } catch {
      return null;
    }
  };

  window.checkWeatherAlerts = function (data) {
    const prefs = window.skycastPrefs;
    if (prefs.weatherAlerts === false) return;
    const high = prefs.tempAlertHigh ?? 38;
    const low = prefs.tempAlertLow ?? 5;
    const precipMm = prefs.precipAlertMm ?? 20;
    const alerts = [];
    data.dates.forEach((d) => {
      const t = data.temps[d];
      const p = data.precs[d];
      if (t != null && t !== -999) {
        if (t >= high) alerts.push(`High temperature ${t.toFixed(1)}°C on ${d}`);
        if (t <= low) alerts.push(`Low temperature ${t.toFixed(1)}°C on ${d}`);
      }
      if (p != null && p !== -999 && p >= precipMm) alerts.push(`Heavy rain ${p.toFixed(1)} mm on ${d}`);
    });
    const box = document.getElementById('weatherAlertsBox');
    if (!box) return;
    if (!alerts.length) {
      box.innerHTML = '<div class="alert alert-success mb-0"><i class="fas fa-check-circle"></i> No alert thresholds exceeded.</div>';
      return;
    }
    box.innerHTML = `<div class="alert alert-warning mb-0"><strong><i class="fas fa-exclamation-triangle"></i> Weather alerts</strong><ul class="mb-0 mt-2">${alerts.slice(0, 5).map((a) => `<li>${a}</li>`).join('')}${alerts.length > 5 ? `<li>…and ${alerts.length - 5} more</li>` : ''}</ul></div>`;
  };

  window.runOnboardingTour = function () {
    const steps = [
      'Click anywhere on the map to select a location for weather analysis.',
      'Open <strong>Weather Info</strong> from the control panel, pick dates, and click <strong>Get Weather Data</strong>.',
      'Right-click the map for markers, saved locations, and quick weather access.',
      'Use the header search to jump to a city — weather coordinates update automatically.',
    ];
    let i = 0;
    const show = () => {
      if (i >= steps.length) {
        localStorage.setItem(ONBOARD_KEY, '1');
        return;
      }
      if (typeof showNotification === 'function') {
        showNotification(`Tip ${i + 1}/${steps.length}: ${steps[i].replace(/<[^>]+>/g, '')}`, 'info');
      }
      i += 1;
      setTimeout(show, 4500);
    };
    show();
  };

  window.selectLocationFromSearch = async function (lat, lng, name, openWeather) {
    window.selectedLat = lat.toFixed(6);
    window.selectedLon = lng.toFixed(6);
    window.selectedPlaceName = name;
    if (typeof map !== 'undefined') {
      map.setView([lat, lng], 14);
      L.marker([lat, lng]).addTo(map).bindPopup(name).openPopup();
    }
    if (typeof updateWeatherLocationDisplay === 'function') updateWeatherLocationDisplay();
    if (openWeather && typeof showWeatherInfo === 'function') {
      showWeatherInfo();
      setTimeout(() => {
        if (typeof getWeatherData === 'function') getWeatherData();
      }, 400);
    }
  };

  document.addEventListener('DOMContentLoaded', async () => {
    const params = parseUrlParams();
    try {
      const cfg = await SkyCastAPI.getConfig();
      if (cfg.jawgAccessToken && typeof window.applyJawgToken === 'function') {
        window.applyJawgToken(cfg.jawgAccessToken);
      }
    } catch { /* optional */ }

    setTimeout(() => {
      if (params.lat && params.lon && typeof map !== 'undefined') {
        map.setView([parseFloat(params.lat), parseFloat(params.lon)], 14);
        if (params.start) document.getElementById('weatherStartDate') && (document.getElementById('weatherStartDate').value = params.start);
        if (params.end) document.getElementById('weatherEndDate') && (document.getElementById('weatherEndDate').value = params.end);
        if (typeof updateWeatherLocationDisplay === 'function') updateWeatherLocationDisplay();
        if (params.openWeather || params.start) {
          setTimeout(() => typeof getWeatherData === 'function' && getWeatherData(), 800);
        }
      } else {
        restoreMapState();
      }
    }, 600);

    if (!localStorage.getItem(ONBOARD_KEY)) {
      setTimeout(runOnboardingTour, 2000);
    }

    const unitsBtn = document.getElementById('unitsToggleBtn');
    if (unitsBtn) unitsBtn.textContent = window.skycastPrefs.units === 'imperial' ? '°F / in' : '°C / mm';

    if (typeof map !== 'undefined') {
      map.on('moveend', saveMapState);
    }

    if (SkyCastAPI.isLoggedIn() && typeof syncCloudData === 'function') {
      syncCloudData();
    }
  });
})();
