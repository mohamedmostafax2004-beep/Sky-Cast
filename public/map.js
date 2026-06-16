// --- Initialize Map ---

let selectedLat = null;
let selectedLon = null;

const JAWG_ATTRIBUTION =
  '<a href="https://jawg.io" target="_blank">&copy; <b>Jawg</b></a> &copy; <a href="https://osm.org/copyright">OSM</a>';

function jawgLagoonUrl(token) {
  return `https://tile.jawg.io/jawg-lagoon/{z}/{x}/{y}{r}.png?access-token=${encodeURIComponent(token)}`;
}

function createJawgLagoonLayer(token) {
  if (!token) return null;
  return L.tileLayer(jawgLagoonUrl(token), {
    attribution: JAWG_ATTRIBUTION,
    maxZoom: 22,
  });
}

const initialJawgToken =
  (typeof window !== 'undefined' && window.SKYCAST_JAWG_TOKEN) || '';

// Map layers configuration
const mapLayers = {
  baseLayers: {
    openStreetMap: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: '&copy; <a href="https://www.esri.com/">Esri</a>',
      maxZoom: 19
    }),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
      maxZoom: 17
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20
    }),
  },
  overlayLayers: {
    traffic: null, // Will be initialized when needed
    weather: null, // Will be initialized when needed
    terrain: null  // Will be initialized when needed
  },
};

const jawgLagoonLayer = createJawgLagoonLayer(initialJawgToken);
if (jawgLagoonLayer) {
  mapLayers.baseLayers.jawgLagoon = jawgLagoonLayer;
}

// Current active layers
let currentBaseLayer = jawgLagoonLayer ? 'jawgLagoon' : 'openStreetMap';
let activeOverlays = new Set();

const BASE_LAYER_ID_MAP = {
  jawgLayer: 'jawgLagoon',
  osmLayer: 'openStreetMap',
  satelliteLayer: 'satellite',
  terrainBaseLayer: 'terrain',
  darkLayer: 'dark'
};

// Leaflet layer control (quick switcher)
const baseLayerControl = {};
if (mapLayers.baseLayers.jawgLagoon) {
  baseLayerControl['Jawg Lagoon'] = mapLayers.baseLayers.jawgLagoon;
}
Object.assign(baseLayerControl, {
  OpenStreetMap: mapLayers.baseLayers.openStreetMap,
  Satellite: mapLayers.baseLayers.satellite,
  Terrain: mapLayers.baseLayers.terrain,
  Dark: mapLayers.baseLayers.dark,
});

window.applyJawgToken = function (token) {
  if (!token) return;
  let layer = mapLayers.baseLayers.jawgLagoon;
  if (!layer) {
    layer = createJawgLagoonLayer(token);
    mapLayers.baseLayers.jawgLagoon = layer;
    baseLayerControl['Jawg Lagoon'] = layer;
  } else {
    layer.setUrl(jawgLagoonUrl(token));
  }
  if (currentBaseLayer === 'jawgLagoon') {
    layer.redraw();
  }
};

const map = L.map('map', {
  center: [31.2653, 32.3019], // Default: Port Said, Egypt
  zoom: 13,
  layers: [mapLayers.baseLayers[currentBaseLayer]],
});

L.control.layers(baseLayerControl, null, { position: 'bottomleft', collapsed: true }).addTo(map);

// Simple distance measure tool
let measurePoints = [];
let measureLine = null;
let measureMode = false;

window.toggleMeasureTool = function () {
  measureMode = !measureMode;
  measurePoints = [];
  if (measureLine) {
    map.removeLayer(measureLine);
    measureLine = null;
  }
  showNotification(measureMode ? 'Measure: click two points on the map.' : 'Measure tool off.', 'info');
};

map.on('click', function (e) {
  if (!measureMode) return;
  measurePoints.push(e.latlng);
  if (measurePoints.length === 2) {
    const d = map.distance(measurePoints[0], measurePoints[1]);
    const km = (d / 1000).toFixed(2);
    const m = Math.round(d);
    if (measureLine) map.removeLayer(measureLine);
    measureLine = L.polyline(measurePoints, { color: '#472dbb', weight: 3 }).addTo(map);
    L.popup()
      .setLatLng(e.latlng)
      .setContent(`Distance: <strong>${km} km</strong> (${m} m)`)
      .openOn(map);
    measurePoints = [];
    measureMode = false;
  }
});

// --- Enhanced Map Features ---
let markerCount = 0;
let isLocationTracking = false;
let locationWatchId = null;
let customMarkers = [];

// Add custom controls
const customControl = L.Control.extend({
  onAdd: function(map) {
    const container = L.DomUtil.create('div', 'custom-control');
    container.innerHTML = '<button onclick="toggleLocationTracking()" style="background: white; border: 1px solid #ccc; padding: 5px 10px; cursor: pointer; border-radius: 3px;">Toggle Tracking</button>';
    return container;
  },
  onRemove: function(map) {}
});

map.addControl(new customControl({ position: 'topright' }));

// --- User location tracking ---
let marker, circle;
let firstFix = true;

// Success callback â†’ update/add marker & accuracy circle
function success(pos) {
  const { latitude: lat, longitude: lon, accuracy } = pos.coords;

  if (!marker) {
    // First fix â†’ create marker & accuracy circle
    marker = L.marker([lat, lon])
      .addTo(map)
      .bindPopup('You are here')
      .openPopup();
    circle = L.circle([lat, lon], { radius: accuracy }).addTo(map);
  } else {
    // Update existing marker & circle
    marker.setLatLng([lat, lon]);
    circle.setLatLng([lat, lon]).setRadius(accuracy);
  }

  // Update stats panel
  updateLocationStats(lat, lon, accuracy);

  // Center map only once (avoid constant jumping)
  if (firstFix) {
    map.setView([lat, lon], 13);
    firstFix = false;
  }
}

// Update location statistics
function updateLocationStats(lat, lon, accuracy) {
  const locationElement = document.getElementById('currentLocation');
  const accuracyElement = document.getElementById('locationAccuracy');
  
  if (locationElement) {
    locationElement.textContent = `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
  }
  
  if (accuracyElement) {
    accuracyElement.textContent = `${Math.round(accuracy)}`;
  }
}    

// Error callback â†’ handle geolocation errors
function error(err) {
  const locationElement = document.getElementById('currentLocation');
  if (locationElement) {
    locationElement.textContent = err.code === 1
      ? 'Location denied'
      : `Error (${err.code})`;
  }
  if (err.code === 1) {
    showNotification('Please allow access to your location.', 'error');
  }
}

function updateTrackingControlUI() {
  const controlItem = document.querySelector('.control-item[onclick*="toggleLocationTracking"]');
  if (controlItem) controlItem.classList.toggle('active', isLocationTracking);
}

function startLocationTracking() {
  if (!navigator.geolocation) {
    showNotification('Geolocation is not supported by this browser.', 'error');
    return;
  }
  if (locationWatchId !== null) return;
  locationWatchId = navigator.geolocation.watchPosition(success, error, {
    enableHighAccuracy: true,
    maximumAge: 10000,
    timeout: 10000
  });
  isLocationTracking = true;
  updateTrackingControlUI();
}

function stopLocationTracking() {
  if (locationWatchId !== null) {
    navigator.geolocation.clearWatch(locationWatchId);
    locationWatchId = null;
  }
  isLocationTracking = false;
  updateTrackingControlUI();
  if (marker) {
    map.removeLayer(marker);
    marker = null;
  }
  if (circle) {
    map.removeLayer(circle);
    circle = null;
  }
  firstFix = true;
  const locationElement = document.getElementById('currentLocation');
  const accuracyElement = document.getElementById('locationAccuracy');
  if (locationElement) locationElement.textContent = 'Tracking off';
  if (accuracyElement) accuracyElement.textContent = '-';
}

updateTrackingControlUI();

// Track selected point for weather (left-click on map)
map.on('click', function (e) {
  if (measureMode) return;
  selectedLat = e.latlng.lat.toFixed(6);
  selectedLon = e.latlng.lng.toFixed(6);
  if (typeof updateWeatherLocationDisplay === 'function') {
    updateWeatherLocationDisplay();
  }
});

window.syncCloudData = async function () {
  if (typeof SkyCastAPI === 'undefined' || !SkyCastAPI.isLoggedIn()) return;
  try {
    const [locations, markers] = await Promise.all([
      SkyCastAPI.getLocations(),
      SkyCastAPI.getMarkers(),
    ]);
    localStorage.setItem('savedLocations', JSON.stringify(locations.map((loc) => ({
      lat: loc.lat,
      lng: loc.lng,
      timestamp: loc.createdAt,
      name: loc.name || loc.placeName,
      _id: loc._id,
    }))));
    markers.forEach((m) => {
      const exists = customMarkers.some((cm) => cm._skycastId === m._id);
      if (!exists) {
        const mk = L.marker([m.lat, m.lng]).addTo(map).bindPopup(m.name);
        mk._skycastId = m._id;
        customMarkers.push(mk);
        markerCount++;
      }
    });
    updateMarkerCount();
    if (typeof updateStats === 'function') updateStats();
  } catch (err) {
    console.warn('Cloud sync:', err.message);
  }
};

window.showMarkerManager = function () {
  const modal = new bootstrap.Modal(document.getElementById('markerManagerModal'));
  const list = document.getElementById('markerManagerList');
  if (!list) return modal.show();
  if (!customMarkers.length) {
    list.innerHTML = '<p class="text-muted text-center">No markers on the map. Right-click to add one.</p>';
  } else {
    list.innerHTML = customMarkers.map((m, i) => {
      const ll = m.getLatLng();
      const name = m.getPopup()?.getContent() || `Marker ${i + 1}`;
      return `<div class="d-flex justify-content-between align-items-center border-bottom py-2">
        <span><i class="fas fa-map-pin text-primary"></i> ${name} <small class="text-muted">(${ll.lat.toFixed(4)}, ${ll.lng.toFixed(4)})</small></span>
        <button class="btn btn-sm btn-outline-danger" onclick="removeMarkerAtIndex(${i})"><i class="fas fa-trash"></i></button>
      </div>`;
    }).join('');
  }
  modal.show();
};

window.removeMarkerAtIndex = function (index) {
  const m = customMarkers[index];
  if (!m) return;
  if (m._skycastId && SkyCastAPI?.isLoggedIn()) {
    SkyCastAPI.deleteMarker(m._skycastId).catch(() => {});
  }
  map.removeLayer(m);
  customMarkers.splice(index, 1);
  markerCount = customMarkers.length;
  updateMarkerCount();
  showMarkerManager();
};



// --- Enhanced Context Menu for Leaflet ---
map.on("contextmenu", function (e) {
  // Remove any existing menu
  const oldMenu = document.getElementById("context-menu");
  if (oldMenu) oldMenu.remove();

  // Create menu container with modern styling
  const menu = document.createElement("div");
  menu.id = "context-menu";

  // Position menu at cursor with smart boundary detection
  const { x, y } = map.latLngToContainerPoint(e.latlng);
  const mapContainer = map.getContainer();
  const mapRect = mapContainer.getBoundingClientRect();
  
  // Smart positioning to prevent overflow
  let menuX = x;
  let menuY = y;
  
  if (x + 200 > mapRect.width) {
    menuX = x - 200;
  }
  if (y + 300 > mapRect.height) {
    menuY = y - 300;
  }
  
  menu.style.left = menuX + "px";
  menu.style.top = menuY + "px";

  // Format coords (lon, lat)
  const lon = e.latlng.lng.toFixed(6);
  const lat = e.latlng.lat.toFixed(6);

  // Add coordinates display with modern styling
  const coords = document.createElement("div");
  coords.className = "context-coords";
  coords.innerHTML = `
    <i class="fas fa-map-marker-alt" style="margin-right: 8px;"></i>
    ${lon}, ${lat}
  `;
  menu.appendChild(coords);

  // Add separator
  const separator = document.createElement("div");
  separator.className = "context-separator";
  menu.appendChild(separator);

  // Add "Add marker" option with icon
  const addMarker = document.createElement("div");
  addMarker.className = "context-menu-item";
  addMarker.innerHTML = `
    <i class="fas fa-plus-circle context-menu-icon"></i>
    Add Marker
  `;

  // Add "Save location" option with icon
  const saveLocation = document.createElement("div");
  saveLocation.className = "context-menu-item";
  saveLocation.innerHTML = `
    <i class="fas fa-bookmark context-menu-icon"></i>
    Save Location
  `;

  // Add "Weather information" option with icon
  const weatherInfo = document.createElement("div");
  weatherInfo.className = "context-menu-item";
  weatherInfo.innerHTML = `
    <i class="fas fa-cloud-sun context-menu-icon"></i>
    Weather Information
  `;

  // Add "Get Directions" option with icon
  const getDirections = document.createElement("div");
  getDirections.className = "context-menu-item";
  getDirections.innerHTML = `
    <i class="fas fa-route context-menu-icon"></i>
    Get Directions
  `;

  // Weather info functionality
  weatherInfo.onclick = function () {
    selectedLat = e.latlng.lat.toFixed(6);
    selectedLon = e.latlng.lng.toFixed(6);

    const dateModal = new bootstrap.Modal(document.getElementById('dateModal'));
    dateModal.show();

    menu.remove();
  };

  // Get directions functionality
  getDirections.onclick = function () {
    const lat = e.latlng.lat.toFixed(6);
    const lon = e.latlng.lng.toFixed(6);
    const url = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    window.open(url, '_blank');
    menu.remove();
  };

  // Add marker logic with enhanced UI
  addMarker.onclick = function () {
    // Clear existing content
    while (menu.children.length > 1) {
      menu.removeChild(menu.lastChild);
    }

    // Add input section
    const inputSection = document.createElement("div");
    inputSection.innerHTML = `
      <div class="context-coords" style="margin-bottom: 12px;">
        <i class="fas fa-edit" style="margin-right: 8px;"></i>
        Create New Marker
      </div>
      <input type="text" class="context-input" placeholder="Enter marker name..." id="marker-name-input">
      <div class="context-actions">
        <button class="context-btn context-btn-secondary" onclick="this.closest('#context-menu').remove()">Cancel</button>
        <button class="context-btn context-btn-primary" onclick="createMarker()">Create</button>
      </div>
    `;
    menu.appendChild(inputSection);

    // Focus input
    setTimeout(() => {
      const input = document.getElementById('marker-name-input');
      if (input) input.focus();
    }, 100);

    // Create marker function
    window.createMarker = function() {
      const input = document.getElementById('marker-name-input');
      const name = input ? input.value.trim() : '';
      const finalName = name || "Custom Marker";
      
      const newMarker = L.marker(e.latlng).addTo(map).bindPopup(finalName).openPopup();
      customMarkers.push(newMarker);
      markerCount++;
      updateMarkerCount();
      if (typeof SkyCastAPI !== 'undefined' && SkyCastAPI.isLoggedIn()) {
        SkyCastAPI.saveMarker({
          lat: e.latlng.lat,
          lng: e.latlng.lng,
          name: finalName,
        }).then((doc) => { newMarker._skycastId = doc._id; }).catch(() => {});
      }
      menu.remove();
    };
  };

  // Save location functionality
  saveLocation.onclick = function () {
    // Add loading state
    saveLocation.innerHTML = `
      <div class="context-menu-loading">
        <div class="loading-spinner"></div>
        Saving location...
      </div>
    `;

    // Simulate save operation
    setTimeout(() => {
      // Here you would typically save to localStorage or send to server
      const locationData = {
        lat: e.latlng.lat,
        lng: e.latlng.lng,
        timestamp: new Date().toISOString(),
        name: `Location ${Date.now()}`
      };
      
      const savedLocations = JSON.parse(localStorage.getItem('savedLocations') || '[]');
      savedLocations.push(locationData);
      localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
      if (typeof SkyCastAPI !== 'undefined' && SkyCastAPI.isLoggedIn()) {
        SkyCastAPI.saveLocation({
          lat: locationData.lat,
          lng: locationData.lng,
          name: locationData.name,
          placeName: locationData.name,
        }).catch(() => {});
      }
      if (typeof updateStats === 'function') updateStats();
      
      // Show success message
      saveLocation.innerHTML = `
        <i class="fas fa-check-circle context-menu-icon" style="color: #2ed573;"></i>
        Location Saved!
      `;
      
      setTimeout(() => menu.remove(), 1000);
    }, 800);
  };

  // Append all menu items
  menu.appendChild(addMarker);
  menu.appendChild(saveLocation);
  menu.appendChild(weatherInfo);
  menu.appendChild(getDirections);

  document.body.appendChild(menu);

  // Add click outside to close
  setTimeout(() => {
    document.addEventListener('click', function closeMenu(event) {
      if (!menu.contains(event.target)) {
        menu.remove();
        document.removeEventListener('click', closeMenu);
      }
    });
  }, 100);
});

// --- Hide menu when clicking elsewhere ---

map.on("click", () => {
  const oldMenu = document.getElementById("context-menu");
  if (oldMenu) oldMenu.remove();
});

// --- Enhanced Functions ---

// Update marker count in stats panel
function updateMarkerCount() {
  const markerCountElement = document.getElementById('markerCount');
  if (markerCountElement) {
    markerCountElement.textContent = markerCount;
  }
}
const geocoder = L.Control.geocoder({
  defaultMarkGeocode: false, // don't zoom automatically
  placeholder: "Search location..."
})
.on('markgeocode', function(e) {
  const latlng = e.geocode.center;
  L.marker(latlng).addTo(map)
    .bindPopup(e.geocode.name)
    .openPopup();
  map.setView(latlng, 13);
})
.addTo(map);



// Enhanced toggle location tracking with modal
function toggleLocationTracking() {
  const modal = new bootstrap.Modal(document.getElementById('locationTrackingModal'));
  
  // Update status in modal
  const statusInfo = document.getElementById('trackingStatusInfo');
  if (statusInfo) {
    if (isLocationTracking) {
      statusInfo.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location tracking is currently <strong>enabled</strong>';
    } else {
      statusInfo.innerHTML = '<i class="fas fa-times-circle text-danger"></i> Location tracking is currently <strong>disabled</strong>. Enable to follow your position on the map.';
    }
  }

  modal.show();
}

// Confirm toggle tracking from modal
function confirmToggleTracking() {
  const statusInfo = document.getElementById('trackingStatusInfo');

  if (isLocationTracking) {
    stopLocationTracking();
    if (statusInfo) {
      statusInfo.innerHTML = '<i class="fas fa-times-circle text-danger"></i> Location tracking is currently <strong>disabled</strong>';
    }
    showNotification('Location tracking disabled.', 'info');
  } else {
    startLocationTracking();
    if (statusInfo) {
      statusInfo.innerHTML = '<i class="fas fa-check-circle text-success"></i> Location tracking is currently <strong>enabled</strong>';
    }
    showNotification('Location tracking enabled!', 'success');
  }

  const modal = bootstrap.Modal.getInstance(document.getElementById('locationTrackingModal'));
  if (modal) modal.hide();
}

function syncMapLayersModal() {
  const baseEntry = Object.entries(BASE_LAYER_ID_MAP).find(([, key]) => key === currentBaseLayer);
  if (baseEntry) {
    const radio = document.getElementById(baseEntry[0]);
    if (radio) radio.checked = true;
  }
  const traffic = document.getElementById('trafficLayer');
  const weather = document.getElementById('weatherLayer');
  const terrain = document.getElementById('terrainOverlayLayer');
  if (traffic) traffic.checked = activeOverlays.has('traffic');
  if (weather) weather.checked = activeOverlays.has('weather');
  if (terrain) terrain.checked = activeOverlays.has('terrain');
}

// Enhanced map layers with modal
function toggleMapLayers() {
  syncMapLayersModal();
  const modal = new bootstrap.Modal(document.getElementById('mapLayersModal'));
  modal.show();
}

// Apply map layers from modal
async function applyMapLayers() {
  const modal = bootstrap.Modal.getInstance(document.getElementById('mapLayersModal'));

  const selectedBaseLayer = document.querySelector('input[name="baseLayer"]:checked');
  if (selectedBaseLayer) {
    const layerKey = BASE_LAYER_ID_MAP[selectedBaseLayer.id];
    if (layerKey) switchBaseLayer(layerKey);
  }

  await syncOverlayLayer('traffic', document.getElementById('trafficLayer')?.checked);
  await syncOverlayLayer('weather', document.getElementById('weatherLayer')?.checked);
  await syncOverlayLayer('terrain', document.getElementById('terrainOverlayLayer')?.checked);

  if (modal) modal.hide();
  showNotification('Map layers updated successfully!', 'success');
}

async function syncOverlayLayer(layerId, shouldShow) {
  const isActive = activeOverlays.has(layerId);
  if (shouldShow && !isActive) {
    await setOverlayLayer(layerId, true);
  } else if (!shouldShow && isActive) {
    setOverlayLayer(layerId, false);
  }
}

async function setOverlayLayer(layerId, shouldShow) {
  if (shouldShow) {
    if (!mapLayers.overlayLayers[layerId]) {
      const layer = layerId === 'weather'
        ? await createRainViewerLayer()
        : createOverlayLayer(layerId);
      if (!layer) {
        if (layerId === 'weather') {
          showNotification('Weather radar overlay could not be loaded.', 'error');
        }
        return;
      }
      mapLayers.overlayLayers[layerId] = layer;
    }
    map.addLayer(mapLayers.overlayLayers[layerId]);
    activeOverlays.add(layerId);
  } else if (mapLayers.overlayLayers[layerId]) {
    map.removeLayer(mapLayers.overlayLayers[layerId]);
    activeOverlays.delete(layerId);
  }
}

async function createRainViewerLayer() {
  try {
    const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
    const data = await res.json();
    const past = data.radar?.past;
    if (!past?.length) return null;
    const path = past[past.length - 1].path;
    return L.tileLayer(
      `https://tilecache.rainviewer.com/v2/radar/${path}/256/{z}/{x}/{y}/2/1_1.png`,
      {
        attribution: '&copy; <a href="https://www.rainviewer.com/">RainViewer</a>',
        maxZoom: 16,
        opacity: 0.55
      }
    );
  } catch (err) {
    console.error('RainViewer overlay error:', err);
    return null;
  }
}

// Switch base layer
function switchBaseLayer(layerId) {
  if (!mapLayers.baseLayers[layerId] || layerId === currentBaseLayer) return;

  map.removeLayer(mapLayers.baseLayers[currentBaseLayer]);
  currentBaseLayer = layerId;
  map.addLayer(mapLayers.baseLayers[currentBaseLayer]);

  showNotification(`Switched to ${getLayerName(layerId)}`, 'info');
}

// Toggle overlay layer (quick control; weather uses RainViewer radar)
async function toggleOverlayLayer(layerId) {
  if (activeOverlays.has(layerId)) {
    setOverlayLayer(layerId, false);
  } else {
    await setOverlayLayer(layerId, true);
  }
}

// Create overlay layer
function createOverlayLayer(layerId) {
  switch (layerId) {
    case 'traffic':
      return L.tileLayer('https://{s}.google.com/vt/lyrs=m@221097413,traffic&x={x}&y={y}&z={z}', {
        attribution: '&copy; <a href="https://www.google.com/maps">Google Maps</a>',
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        maxZoom: 20
      });
    case 'weather':
      return null;
    case 'terrain':
      return L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://opentopomap.org/">OpenTopoMap</a>',
        maxZoom: 17,
        opacity: 0.7
      });
    default:
      return null;
  }
}

// Get layer display name
function getLayerName(layerId) {
  const names = {
    jawgLagoon: 'Jawg Lagoon',
    openStreetMap: 'OpenStreetMap',
    satellite: 'Satellite',
    terrain: 'Terrain',
    dark: 'Dark Mode'
  };
  return names[layerId] || layerId;
}


// Enhanced show saved locations with modal
function showSavedLocations() {
  const modal = new bootstrap.Modal(document.getElementById('savedLocationsModal'));
  
  // Load saved locations into modal
  loadSavedLocationsIntoModal();
  
  modal.show();
}

// Load saved locations into modal
function loadSavedLocationsIntoModal() {
  const savedLocationsList = document.getElementById('savedLocationsList');
  const saved = JSON.parse(localStorage.getItem("savedLocations") || "[]");
  
  if (saved.length === 0) {
    savedLocationsList.innerHTML = `
      <div class="text-center">
        <i class="fas fa-bookmark fa-3x text-muted mb-3"></i>
        <h6>No Saved Locations</h6>
        <p class="text-muted">You haven't saved any locations yet. Right-click on the map to save a location.</p>
      </div>
    `;
  } else {
    let html = '<div class="row">';
    saved.forEach((location, index) => {
      const date = new Date(location.timestamp).toLocaleString();
      html += `
        <div class="col-md-6 mb-3">
          <div class="card">
            <div class="card-body">
              <h6 class="card-title">
                <i class="fas fa-map-marker-alt text-primary"></i>
                Location ${index + 1}
              </h6>
              <p class="card-text">
                <small class="text-muted">Lat: ${location.lat.toFixed(6)}</small><br>
                <small class="text-muted">Lng: ${location.lng.toFixed(6)}</small><br>
                <small class="text-muted">Saved: ${date}</small>
              </p>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="viewLocation(${location.lat}, ${location.lng})">
                  <i class="fas fa-eye"></i> View
                </button>
                <button class="btn btn-outline-danger" onclick="deleteLocation(${index})">
                  <i class="fas fa-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    });
    html += '</div>';
    savedLocationsList.innerHTML = html;
  }
}

// View location on map
function viewLocation(lat, lng) {
  map.setView([lat, lng], 15);
  const modal = bootstrap.Modal.getInstance(document.getElementById('savedLocationsModal'));
  modal.hide();
  showNotification('Location centered on map', 'success');
}

// Delete saved location
function deleteLocation(index) {
  const saved = JSON.parse(localStorage.getItem("savedLocations") || "[]");
  saved.splice(index, 1);
  localStorage.setItem("savedLocations", JSON.stringify(saved));
  loadSavedLocationsIntoModal();
  showNotification('Location deleted', 'success');
}

// Clear all saved locations
function clearAllSavedLocations() {
  localStorage.removeItem("savedLocations");
  loadSavedLocationsIntoModal();
  showNotification('All saved locations cleared', 'success');
}

// Enhanced export map data with modal
function exportMapData() {
  const modal = new bootstrap.Modal(document.getElementById('exportDataModal'));
  modal.show();
}

// Perform export from modal
function performExport() {
  const format = document.getElementById('exportFormat').value;
  const includeMarkers = document.getElementById('includeMarkers').checked;
  const includeSaved = document.getElementById('includeSaved').checked;
  const includeStats = document.getElementById('includeStats').checked;
  
  const data = {
    exportTime: new Date().toISOString(),
    mapCenter: map.getCenter(),
    mapZoom: map.getZoom()
  };
  
  if (includeMarkers) {
    data.markers = markerCount;
  }
  
  if (includeSaved) {
    data.savedLocations = JSON.parse(localStorage.getItem("savedLocations") || "[]");
  }
  
  if (includeStats) {
    data.statistics = {
      totalMarkers: markerCount,
      savedLocations: JSON.parse(localStorage.getItem("savedLocations") || "[]").length,
      currentLocation: document.getElementById('currentLocation').textContent,
      accuracy: document.getElementById('locationAccuracy').textContent
    };
  }
  
  let blob, filename;
  
  if (format === 'json') {
    blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    filename = `map-data-${new Date().toISOString().split('T')[0]}.json`;
  } else if (format === 'csv') {
    const csv = convertToCSV(data);
    blob = new Blob([csv], { type: 'text/csv' });
    filename = `map-data-${new Date().toISOString().split('T')[0]}.csv`;
  } else if (format === 'kml') {
    const kml = convertToKML(data);
    blob = new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' });
    filename = `map-data-${new Date().toISOString().split('T')[0]}.kml`;
  }
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
  
  const modal = bootstrap.Modal.getInstance(document.getElementById('exportDataModal'));
  modal.hide();
  showNotification('Map data exported successfully!', 'success');
}

// Convert data to CSV format
function convertToCSV(data) {
  let csv = 'Type,Latitude,Longitude,Timestamp,Name\n';
  
  if (data.savedLocations) {
    data.savedLocations.forEach((location, index) => {
      csv += `Saved Location,${location.lat},${location.lng},${location.timestamp},Location ${index + 1}\n`;
    });
  }
  
  return csv;
}

// Convert data to KML format
function convertToKML(data) {
  let kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Map Data Export</name>
    <description>Exported on ${new Date().toISOString()}</description>`;
  
  if (data.savedLocations) {
    data.savedLocations.forEach((location, index) => {
      kml += `
    <Placemark>
      <name>Location ${index + 1}</name>
      <description>Saved: ${new Date(location.timestamp).toLocaleString()}</description>
      <Point>
        <coordinates>${location.lng},${location.lat},0</coordinates>
      </Point>
    </Placemark>`;
    });
  }
  
  kml += `
  </Document>
</kml>`;
  
  return kml;
}

// Enhanced weather information with modal
function showWeatherInfo() {
  if (!selectedLat || !selectedLon) {
    const center = map.getCenter();
    selectedLat = center.lat.toFixed(6);
    selectedLon = center.lng.toFixed(6);
  }
  if (typeof updateWeatherLocationDisplay === 'function') {
    updateWeatherLocationDisplay();
  }

  const modal = new bootstrap.Modal(document.getElementById('weatherInfoModal'));
  modal.show();

  setTimeout(() => {
    initializeWeatherModal();
  }, 300);
}

// Enhanced weather functionality
async function getWeatherData() {
  const lat = selectedLat ?? map.getCenter().lat.toFixed(6);
  const lon = selectedLon ?? map.getCenter().lng.toFixed(6);

  const startInput = document.getElementById('weatherStartDate');
  const endInput = document.getElementById('weatherEndDate');
  if (!startInput?.value || !endInput?.value) {
    showNotification('Please select a start and end date.', 'error');
    return;
  }

  const start = startInput.value.replace(/-/g, '');
  const end = endInput.value.replace(/-/g, '');
  if (start > end) {
    showNotification('Start date must be before end date.', 'error');
    return;
  }

  selectedLat = lat;
  selectedLon = lon;
  if (typeof updateWeatherLocationDisplay === 'function') {
    updateWeatherLocationDisplay();
  }

  if (typeof fetchWeatherDataWith10YearAverage === 'function') {
    await fetchWeatherDataWith10YearAverage(lat, lon, start, end, {
      showDetailModal: true,
      updateCharts: true
    });
  } else {
    showNotification('Weather module failed to load. Refresh the page.', 'error');
  }
}

function exportWeatherData() {
  if (typeof exportLastWeatherData === 'function') {
    exportLastWeatherData();
  } else {
    showNotification('Load weather data first, then export.', 'info');
  }
}

// Interactive weather feature cards (bind once)
function initializeWeatherModal() {
  const startDateInput = document.getElementById('weatherStartDate');
  const endDateInput = document.getElementById('weatherEndDate');
  if (startDateInput && !startDateInput.value) {
    const today = new Date();
    const oneWeekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    startDateInput.value = oneWeekAgo.toISOString().split('T')[0];
    if (endDateInput) endDateInput.value = today.toISOString().split('T')[0];
  }

  if (window._weatherModalInited) return;
  window._weatherModalInited = true;

  document.querySelectorAll('.weather-feature-card').forEach((card) => {
    card.addEventListener('click', function () {
      const feature = this.dataset.feature;
      const chartId =
        feature === 'temperature'
          ? 'temperatureChart'
          : feature === 'precipitation'
            ? 'precipitationChart'
            : feature === 'wind'
              ? 'windChart'
              : feature === 'air-quality'
                ? 'aodChart'
                : null;
      if (chartId) {
        document.getElementById(chartId)?.closest('.chart-container')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      document.querySelectorAll('.weather-feature-card').forEach((c) => c.classList.remove('active'));
      this.classList.add('active');
    });
  });

  document.querySelectorAll('.chart-controls .btn').forEach((btn) => {
    btn.addEventListener('click', function () {
      const parent = this.closest('.chart-controls');
      parent?.querySelectorAll('.btn').forEach((b) => b.classList.remove('active'));
      this.classList.add('active');
      if (typeof refreshWeatherChartsFromControls === 'function') {
        refreshWeatherChartsFromControls();
      }
    });
  });
}

// Enhanced clear all markers with modal
function clearAllMarkers() {
  const modal = new bootstrap.Modal(document.getElementById('clearMarkersModal'));
  
  // Update marker count in modal
  document.getElementById('markerCountWarning').textContent = customMarkers.length;
  
  modal.show();
}

// Confirm clear markers from modal
function confirmClearMarkers() {
  if (customMarkers.length === 0) {
    showNotification('No markers to clear.', 'info');
  } else {
    const clearedCount = customMarkers.length;
    customMarkers.forEach(m => map.removeLayer(m));
    customMarkers = [];
    markerCount = 0;
    updateMarkerCount();
    showNotification(`Cleared ${clearedCount} markers from the map.`, 'success');
  }
  
  const modal = bootstrap.Modal.getInstance(document.getElementById('clearMarkersModal'));
  modal.hide();
}

// Notification system
function showNotification(message, type = 'info') {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll('.notification');
  existingNotifications.forEach(notification => notification.remove());
  
  const notification = document.createElement('div');
  notification.className = `notification notification-${type}`;
  notification.innerHTML = `
    <div class="notification-content">
      <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
      <span>${message}</span>
    </div>
  `;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    background: ${type === 'success' ? '#2ed573' : type === 'error' ? '#ff4757' : '#472dbb'};
    color: white;
    padding: 15px 20px;
    border-radius: 10px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    animation: slideInRight 0.3s ease;
    max-width: 300px;
    font-weight: 600;
  `;
  
  document.body.appendChild(notification);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    notification.style.animation = 'slideOutRight 0.3s ease';
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Initialize marker count
updateMarkerCount();

// AI Chatbot functionality
function showAIChatbot() {
  const modal = new bootstrap.Modal(document.getElementById('aiChatbotModal'));
  modal.show();
}

function askQuickQuestion(question) {
  document.getElementById('chatInput').value = question;
  sendMessage();
}

function buildChatContext() {
  if (!window.lastLoadedWeatherSummary) {
    if (selectedLat != null && selectedLon != null) {
      return `Map selection: lat ${selectedLat}, lon ${selectedLon}.`;
    }
    return '';
  }
  const s = window.lastLoadedWeatherSummary;
  const last = s.dates[s.dates.length - 1];
  const temp = s.temps[last];
  const rain = s.precs[last];
  const loc =
    selectedLat != null && selectedLon != null
      ? `lat ${selectedLat}, lon ${selectedLon}`
      : 'map center';
  const tempStr = temp != null && temp !== -999 ? `${temp}°C` : 'N/A';
  const rainStr = rain != null && rain !== -999 ? `${rain} mm` : 'N/A';
  return `Location (${loc}). Latest in loaded range: temp ${tempStr}, precipitation ${rainStr}.`;
}

async function sendMessage() {
  const input = document.getElementById('chatInput');
  const message = input.value.trim();

  if (!message) return;

  addMessage(message, 'user');
  input.value = '';
  showTypingIndicator(message);

  const context = buildChatContext();
  let response = null;

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });
    const data = await res.json();
    if (data.reply) {
      response = data.reply;
      if (data.source === 'llm' && typeof showNotification === 'function') {
        showNotification('AI response (OpenAI)', 'info');
      }
    }
  } catch (e) {
    console.warn('Chat API:', e);
  }

  hideTypingIndicator();
  if (!response && window.SkyCastChat) {
    response = SkyCastChat.processMessage(message, context);
  }
  if (!response) {
    response = containsArabic(message)
      ? 'ØªØ¹Ø°Ø± Ø§Ù„Ø§ØªØµØ§Ù„ Ø¨Ø§Ù„Ù…Ø³Ø§Ø¹Ø¯. Ø¬Ø±Ù‘Ø¨ Ù…Ø±Ø© Ø£Ø®Ø±Ù‰ Ø£Ùˆ Ø§Ø®ØªØ± Ø£Ø­Ø¯ Ø§Ù„Ø£Ø³Ø¦Ù„Ø© Ø§Ù„Ø³Ø±ÙŠØ¹Ø© Ø£Ø¯Ù†Ø§Ù‡.'
      : 'Could not reach the assistant. Try again or tap a quick prompt below.';
  }
  addMessage(response, 'bot');
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatBotMessage(text) {
  return escapeHTML(text)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

function containsArabic(text) {
  return /[\u0600-\u06FF]/.test(text);
}

function addMessage(text, sender) {
  const chatMessages = document.getElementById('chatMessages');
  const messageDiv = document.createElement('div');
  messageDiv.className = `chat-message ${sender}-message`;
  messageDiv.setAttribute('dir', containsArabic(text) ? 'rtl' : 'ltr');
  
  const avatar = sender === 'bot' ? 'fas fa-robot' : 'fas fa-user';
  const time = new Date().toLocaleTimeString('ar-EG', {hour: '2-digit', minute:'2-digit'});
  const safeText = sender === 'bot' ? formatBotMessage(text) : escapeHTML(text);
  
  messageDiv.innerHTML = `
    <div class="message-avatar">
      <i class="${avatar}"></i>
    </div>
    <div class="message-content">
      <div class="message-text">${safeText}</div>
      <div class="message-time">${time}</div>
    </div>
  `;
  
  chatMessages.appendChild(messageDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showTypingIndicator(userMessage) {
  const chatMessages = document.getElementById('chatMessages');
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-message bot-message typing-indicator';
  typingDiv.id = 'typingIndicator';
  const rtl = containsArabic(userMessage || '');
  typingDiv.setAttribute('dir', rtl ? 'rtl' : 'ltr');
  const thinking = rtl ? 'Ø£ÙÙƒØ± ÙÙŠ Ø¥Ø¬Ø§Ø¨ØªÙƒ' : 'Thinkingâ€¦';

  typingDiv.innerHTML = `
    <div class="message-avatar">
      <i class="fas fa-robot"></i>
    </div>
    <div class="message-content">
      <div class="message-text">
        <span>${thinking}</span>
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  `;
  
  chatMessages.appendChild(typingDiv);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

function renderChatQuickPrompts() {
  const container = document.getElementById('chatQuickPrompts');
  if (!container || !window.SkyCastChat?.QUICK_PROMPTS) return;

  const prompts = SkyCastChat.QUICK_PROMPTS;
  const icons = ['fa-tshirt', 'fa-umbrella', 'fa-hiking', 'fa-cloud-sun', 'fa-map', 'fa-balance-scale', 'fa-bookmark', 'fa-wind', 'fa-person-running', 'fa-file-pdf', 'fa-circle-question', 'fa-layer-group'];

  container.innerHTML = '';
  const labelAr = document.createElement('div');
  labelAr.className = 'quick-prompts-label';
  labelAr.setAttribute('dir', 'rtl');
  labelAr.textContent = 'أسئلة سريعة';
  container.appendChild(labelAr);

  prompts.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-question-btn';
    btn.setAttribute('dir', 'rtl');
    btn.innerHTML = `<i class="fas ${icons[i] || 'fa-comment'}"></i> ${p.ar}`;
    btn.onclick = () => askQuickQuestion(p.ar);
    container.appendChild(btn);
  });

  const labelEn = document.createElement('div');
  labelEn.className = 'quick-prompts-label';
  labelEn.textContent = 'Quick prompts (English)';
  container.appendChild(labelEn);

  prompts.forEach((p, i) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-question-btn';
    btn.innerHTML = `<i class="fas ${icons[i] || 'fa-comment'}"></i> ${p.en}`;
    btn.onclick = () => askQuickQuestion(p.en);
    container.appendChild(btn);
  });
}

// Add Enter key support for chat input
document.addEventListener('DOMContentLoaded', function() {
  renderChatQuickPrompts();
  const chatInput = document.getElementById('chatInput');
  if (chatInput) {
    chatInput.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        sendMessage();
      }
    });
  }
});


// --- Show Weather Modal Function ---
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("dateForm").addEventListener("submit", function (e) {
    e.preventDefault();

    const startVal = document.getElementById("startDate").value;
    const endVal = document.getElementById("endDate").value;
    const start = startVal.replace(/-/g, "");
    const end = endVal.replace(/-/g, "");

    const ws = document.getElementById('weatherStartDate');
    const we = document.getElementById('weatherEndDate');
    if (ws) ws.value = startVal;
    if (we) we.value = endVal;

    const lat = selectedLat ?? map.getCenter().lat.toFixed(6);
    const lon = selectedLon ?? map.getCenter().lng.toFixed(6);
    fetchWeatherDataWith10YearAverage(lat, lon, start, end, {
      showDetailModal: true,
      updateCharts: true
    });

    const modal = bootstrap.Modal.getInstance(document.getElementById('dateModal'));
    modal.hide();
  });
});
