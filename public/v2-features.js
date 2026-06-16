/**
 * SkyCast V2 — compare locations, PDF export, PWA install, DB sync
 */
(function () {
  const compareState = {
    slot: 'A',
    locationA: null,
    locationB: null,
    charts: { a: null, b: null },
  };

  window.showCompareLocations = function () {
    const modal = new bootstrap.Modal(document.getElementById('compareModal'));
    updateCompareUI();
    modal.show();
  };

  window.setCompareSlot = function (slot) {
    compareState.slot = slot;
    if (typeof selectedLat !== 'undefined' && selectedLat && selectedLon) {
      const loc = {
        lat: parseFloat(selectedLat),
        lon: parseFloat(selectedLon),
        label: window.selectedPlaceName || `${selectedLat}, ${selectedLon}`,
      };
      if (slot === 'A') compareState.locationA = loc;
      else compareState.locationB = loc;
      updateCompareUI();
      if (typeof showNotification === 'function') {
        showNotification(`Location ${slot} set from map selection`, 'success');
      }
    } else if (typeof showNotification === 'function') {
      showNotification('Click the map first to pick coordinates', 'info');
    }
  };

  function updateCompareUI() {
    const elA = document.getElementById('compareLocA');
    const elB = document.getElementById('compareLocB');
    if (elA) elA.textContent = compareState.locationA?.label || 'Not set — click map, then "Set A"';
    if (elB) elB.textContent = compareState.locationB?.label || 'Not set — click map, then "Set B"';
  }

  window.runLocationCompare = async function () {
    const start = document.getElementById('compareStartDate')?.value?.replace(/-/g, '');
    const end = document.getElementById('compareEndDate')?.value?.replace(/-/g, '');
    if (!compareState.locationA || !compareState.locationB) {
      showNotification('Set both locations A and B first.', 'error');
      return;
    }
    if (!start || !end) {
      showNotification('Select a date range.', 'error');
      return;
    }
    showLoadingCompare(true);
    try {
      const res = await fetch('/api/weather/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locations: [
            { lat: compareState.locationA.lat, lon: compareState.locationA.lon, label: compareState.locationA.label },
            { lat: compareState.locationB.lat, lon: compareState.locationB.lon, label: compareState.locationB.label },
          ],
          start,
          end,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Compare failed');
      window.lastCompareData = data;
      renderCompareCharts(data.results);
      renderCompareSummary(data.results);
    } catch (e) {
      showNotification(e.message, 'error');
    } finally {
      showLoadingCompare(false);
    }
  };

  function showLoadingCompare(on) {
    const el = document.getElementById('compareLoading');
    if (el) el.style.display = on ? 'block' : 'none';
  }

  function renderCompareSummary(results) {
    const el = document.getElementById('compareSummary');
    if (!el) return;
    el.innerHTML = results.map((r, i) => {
      const temps = r.dates.map((d) => r.temps[d]).filter((t) => t != null && t !== -999);
      const precs = r.dates.map((d) => r.precs[d]).filter((p) => p != null && p !== -999);
      const avgT = temps.length ? (temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1) : '—';
      const sumP = precs.length ? precs.reduce((a, b) => a + b, 0).toFixed(1) : '—';
      return `<div class="col-md-6"><div class="card p-3"><h6>Location ${String.fromCharCode(65 + i)}: ${r.label}</h6><p class="mb-0">Avg temp: <strong>${avgT}°C</strong> · Total rain: <strong>${sumP} mm</strong></p></div></div>`;
    }).join('');
  }

  function renderCompareCharts(results) {
    if (typeof Chart === 'undefined') return;
    ['compareChartA', 'compareChartB'].forEach((id, i) => {
      const canvas = document.getElementById(id);
      if (!canvas || !results[i]) return;
      const r = results[i];
      if (compareState.charts[id]) compareState.charts[id].destroy();
      const labels = r.dates.map((d) => `${d.slice(4, 6)}/${d.slice(6, 8)}`);
      const temps = r.dates.map((d) => {
        const v = r.temps[d];
        return v == null || v === -999 ? null : Number(v.toFixed(1));
      });
      compareState.charts[id] = new Chart(canvas, {
        type: 'line',
        data: {
          labels,
          datasets: [{
            label: `Temp °C — ${r.label}`,
            data: temps,
            borderColor: i === 0 ? '#667eea' : '#e17055',
            fill: false,
            tension: 0.3,
          }],
        },
        options: { responsive: true, maintainAspectRatio: false },
      });
    });
  }

  window.downloadWeatherPdf = async function () {
    try {
      const body = {};
      if (window.lastCompareData?.results?.length >= 2) {
        body.compareData = window.lastCompareData.results;
        body.start = window.lastCompareData.start;
        body.end = window.lastCompareData.end;
      } else if (window.lastWeatherChartData) {
        body.weatherData = window.lastWeatherChartData;
        body.placeName = window.selectedPlaceName;
      } else if (typeof selectedLat !== 'undefined' && selectedLat) {
        const s = document.getElementById('weatherStartDate')?.value?.replace(/-/g, '');
        const e = document.getElementById('weatherEndDate')?.value?.replace(/-/g, '');
        body.lat = selectedLat;
        body.lon = selectedLon;
        body.start = s;
        body.end = e;
        body.placeName = window.selectedPlaceName;
      } else {
        showNotification('Load weather data or run a comparison first.', 'info');
        return;
      }
      const res = await fetch('/api/weather/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'PDF failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'skycast-weather-report.pdf';
      a.click();
      URL.revokeObjectURL(url);
      showNotification('PDF downloaded.', 'success');
    } catch (e) {
      showNotification(e.message, 'error');
    }
  };

  window.syncLocalDataToCloud = async function () {
    if (!SkyCastAPI?.isLoggedIn()) {
      showNotification('Log in to sync data to the cloud.', 'info');
      return;
    }
    const locations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locations, markers: [] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showNotification(`Synced ${data.imported.locations} new locations to your account.`, 'success');
      if (typeof syncCloudData === 'function') syncCloudData();
    } catch (e) {
      showNotification(e.message, 'error');
    }
  };

  window.installPwa = async function () {
    const prompt = window.deferredPwaPrompt;
    if (!prompt) {
      showNotification('Install not available — use browser menu "Install app" or add to home screen.', 'info');
      return;
    }
    prompt.prompt();
    await prompt.userChoice;
    window.deferredPwaPrompt = null;
  };

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.deferredPwaPrompt = e;
    const btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.style.display = 'inline-block';
  });

  if ('serviceWorker' in navigator) {
    // In localhost development, old service-worker caches can keep showing the
    // logged-out navbar after login. Clear them to keep auth UI fresh.
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      navigator.serviceWorker.getRegistrations?.().then((regs) => regs.forEach((reg) => reg.unregister())).catch(() => {});
      if (window.caches?.keys) {
        caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
      }
    } else {
      navigator.serviceWorker.register('/sw.js').catch((err) => console.warn('SW:', err));
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const cs = document.getElementById('compareStartDate');
    const ce = document.getElementById('compareEndDate');
    const ws = document.getElementById('weatherStartDate');
    const we = document.getElementById('weatherEndDate');
    if (cs && ws?.value) cs.value = ws.value;
    if (ce && we?.value) ce.value = we.value;
    if (cs && !cs.value && typeof applyDatePreset === 'function') {
      applyDatePreset('7d');
      if (ce && ws) {
        cs.value = ws.value;
        ce.value = we.value;
      }
    }
  });
})();
