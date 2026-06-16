/**
 * SkyCast API client — all server requests go through here.
 */
const SkyCastAPI = {
  async getConfig() {
    const res = await fetch('/api/config');
    if (!res.ok) throw new Error('Config fetch failed');
    return res.json();
  },

  async search(q) {
    const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Search failed');
    return data.results || [];
  },

  async reverseGeocode(lat, lon) {
    const res = await fetch(`/api/reverse?lat=${lat}&lon=${lon}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Reverse geocode failed');
    return data;
  },

  async getWeather(lat, lon, start, end) {
    const params = new URLSearchParams({ lat, lon, start, end });
    const res = await fetch(`/api/weather?${params}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Weather fetch failed');
    return data;
  },

  async getLocations() {
    const res = await fetch('/api/locations');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load locations');
    return data.locations || [];
  },

  async saveLocation(payload) {
    const res = await fetch('/api/locations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save');
    return data.location;
  },

  async deleteLocation(id) {
    const res = await fetch(`/api/locations/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete location');
    return true;
  },

  async clearLocations() {
    const res = await fetch('/api/locations', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear locations');
    return true;
  },

  async getMarkers() {
    const res = await fetch('/api/markers');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load markers');
    return data.markers || [];
  },

  async saveMarker(payload) {
    const res = await fetch('/api/markers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to save marker');
    return data.marker;
  },

  async deleteMarker(id) {
    const res = await fetch(`/api/markers/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete marker');
    return true;
  },

  async clearMarkers() {
    const res = await fetch('/api/markers', { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to clear markers');
    return true;
  },

  async getProfile() {
    const res = await fetch('/api/profile');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Profile failed');
    return data;
  },

  async updatePreferences(prefs) {
    const res = await fetch('/api/profile/preferences', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(prefs),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Update failed');
    return data.user;
  },

  isLoggedIn() {
    return !!(window.SKYCAST_USER_ID);
  },

  async chat(message, context) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, context }),
    });
    return res.json();
  },

  async compareWeather(locations, start, end) {
    const res = await fetch('/api/weather/compare', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations, start, end }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },

  async downloadPdfReport(body) {
    const res = await fetch('/api/weather/report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error);
    }
    return res.blob();
  },

  async syncToCloud(locations, markers) {
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ locations, markers }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);
    return data;
  },
};
