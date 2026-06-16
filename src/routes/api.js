const express = require('express');
const rateLimit = require('express-rate-limit');
const { getDbStatus } = require('../db');
const { fetchWeatherRange } = require('../services/weather');
const { searchPlaces, reverseGeocode } = require('../services/geocode');
const { requireAuth } = require('../middleware/auth');
const SavedLocation = require('../models/SavedLocation');
const MapMarker = require('../models/MapMarker');
const User = require('../models/User');
const config = require('../config');
const { chatWithLLM } = require('../services/llm');
const { processMessage: processChatRules } = require('../../public/chat-rules');
const { buildWeatherPdf, buildComparePdf } = require('../services/pdfReport');

const router = express.Router();

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: 'Too many search requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const weatherLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 40,
  message: { error: 'Too many weather requests. Please wait a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    app: 'SkyCast',
    version: '2.0.0',
    database: getDbStatus(),
    timestamp: new Date().toISOString(),
  });
});

router.get('/config', (req, res) => {
  res.json({
    jawgAccessToken: config.jawgAccessToken || null,
    userId: req.session?.userId || null,
    username: req.session?.username || null,
    llmEnabled: !!config.openaiApiKey,
    pwaEnabled: true,
    dbConnected: getDbStatus().connected,
  });
});

router.get('/search', searchLimiter, async (req, res) => {
  try {
    const { q } = req.query;
    const results = await searchPlaces(q);
    res.json({ results });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

router.get('/reverse', searchLimiter, async (req, res) => {
  try {
    const { lat, lon } = req.query;
    if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });
    const result = await reverseGeocode(lat, lon);
    res.json(result);
  } catch (error) {
    console.error('Reverse geocode error:', error);
    res.status(500).json({ error: 'Reverse geocode failed' });
  }
});

router.get('/weather', weatherLimiter, async (req, res) => {
  try {
    const { lat, lon, start, end } = req.query;
    if (!lat || !lon || !start || !end) {
      return res.status(400).json({ error: 'lat, lon, start, and end are required (YYYYMMDD)' });
    }
    if (!/^\d{8}$/.test(start) || !/^\d{8}$/.test(end)) {
      return res.status(400).json({ error: 'Dates must be YYYYMMDD format' });
    }
    const data = await fetchWeatherRange(lat, lon, start, end);
    res.json(data);
  } catch (error) {
    console.error('Weather API error:', error);
    res.status(502).json({ error: error.message || 'Weather fetch failed' });
  }
});

// --- Authenticated: saved locations ---
router.get('/locations', requireAuth, async (req, res) => {
  try {
    const locations = await SavedLocation.find({ userId: req.session.userId })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ locations });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load locations' });
  }
});

router.post('/locations', requireAuth, async (req, res) => {
  try {
    const { lat, lng, name, placeName } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const doc = await SavedLocation.create({
      userId: req.session.userId,
      lat,
      lng,
      name: name || 'Saved Location',
      placeName,
    });
    res.status(201).json({ location: doc });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save location' });
  }
});

router.delete('/locations/:id', requireAuth, async (req, res) => {
  try {
    await SavedLocation.deleteOne({ _id: req.params.id, userId: req.session.userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete location' });
  }
});

router.delete('/locations', requireAuth, async (req, res) => {
  try {
    await SavedLocation.deleteMany({ userId: req.session.userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear locations' });
  }
});

// --- Authenticated: markers ---
router.get('/markers', requireAuth, async (req, res) => {
  try {
    const markers = await MapMarker.find({ userId: req.session.userId }).sort({ createdAt: -1 }).lean();
    res.json({ markers });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load markers' });
  }
});

router.post('/markers', requireAuth, async (req, res) => {
  try {
    const { lat, lng, name, color, notes } = req.body;
    if (lat == null || lng == null) return res.status(400).json({ error: 'lat and lng required' });
    const doc = await MapMarker.create({
      userId: req.session.userId,
      lat,
      lng,
      name: name || 'Marker',
      color,
      notes,
    });
    res.status(201).json({ marker: doc });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save marker' });
  }
});

router.delete('/markers/:id', requireAuth, async (req, res) => {
  try {
    await MapMarker.deleteOne({ _id: req.params.id, userId: req.session.userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

router.delete('/markers', requireAuth, async (req, res) => {
  try {
    await MapMarker.deleteMany({ userId: req.session.userId });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to clear markers' });
  }
});

// --- Profile / preferences ---
router.get('/profile', requireAuth, async (req, res) => {
  try {
    const user = await User.findById(req.session.userId).select('-password -verificationTokenHash -resetPasswordTokenHash').lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    const [locationCount, markerCount] = await Promise.all([
      SavedLocation.countDocuments({ userId: req.session.userId }),
      MapMarker.countDocuments({ userId: req.session.userId }),
    ]);
    res.json({ user, stats: { locationCount, markerCount } });
  } catch (error) {
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.put('/profile/preferences', requireAuth, async (req, res) => {
  try {
    const allowed = ['units', 'defaultLat', 'defaultLng', 'defaultZoom', 'weatherAlerts', 'tempAlertHigh', 'tempAlertLow', 'precipAlertMm'];
    const update = {};
    allowed.forEach((k) => {
      if (req.body[k] !== undefined) update[`preferences.${k}`] = req.body[k];
    });
    const user = await User.findByIdAndUpdate(req.session.userId, { $set: update }, { new: true }).select('-password -verificationTokenHash -resetPasswordTokenHash');
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

// --- V2: Compare two locations ---
router.post('/weather/compare', weatherLimiter, async (req, res) => {
  try {
    const { locations, start, end } = req.body;
    if (!Array.isArray(locations) || locations.length < 2) {
      return res.status(400).json({ error: 'Provide at least 2 locations' });
    }
    if (!start || !end) return res.status(400).json({ error: 'start and end required (YYYYMMDD)' });
    const results = await Promise.all(
      locations.slice(0, 2).map(async (loc) => {
        const data = await fetchWeatherRange(loc.lat, loc.lon, start, end);
        return { ...data, label: loc.label || `${loc.lat}, ${loc.lon}` };
      })
    );
    res.json({ results, start, end });
  } catch (error) {
    res.status(502).json({ error: error.message || 'Compare failed' });
  }
});

// --- V2: PDF report ---
router.post('/weather/report', weatherLimiter, async (req, res) => {
  try {
    const { weatherData, placeName, compareData, start, end } = req.body;
    let buffer;
    if (compareData?.length >= 2) {
      buffer = await buildComparePdf(compareData, start, end);
    } else if (weatherData) {
      buffer = await buildWeatherPdf(weatherData, { placeName });
    } else {
      const { lat, lon, start: s, end: e } = req.body;
      if (!lat || !lon || !s || !e) return res.status(400).json({ error: 'weatherData or lat/lon/start/end required' });
      const data = await fetchWeatherRange(lat, lon, s, e);
      buffer = await buildWeatherPdf(data, { placeName });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="skycast-weather-report.pdf"');
    res.send(buffer);
  } catch (error) {
    console.error('PDF error:', error);
    res.status(500).json({ error: 'PDF generation failed' });
  }
});

// --- V2: LLM chat ---
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 20 });

router.post('/chat', chatLimiter, async (req, res) => {
  try {
    const { message, context } = req.body;
    if (!message?.trim()) return res.status(400).json({ error: 'message required' });

    let reply = null;
    let source = 'rules';

    if (config.openaiApiKey) {
      try {
        reply = await chatWithLLM(message.trim(), context || '');
        if (reply) source = 'llm';
      } catch (err) {
        console.warn('LLM fallback:', err.message);
      }
    }

    if (!reply) {
      reply = processChatRules(message.trim(), context || '');
      source = 'rules';
    }

    res.json({ reply, source, llmConfigured: !!config.openaiApiKey });
  } catch (error) {
    res.status(500).json({ error: 'Chat failed' });
  }
});

// --- V2: Sync localStorage → MongoDB ---
router.post('/sync', requireAuth, async (req, res) => {
  try {
    const { locations = [], markers = [] } = req.body;
    const userId = req.session.userId;
    let locCount = 0;
    let markCount = 0;

    for (const loc of locations) {
      const exists = await SavedLocation.findOne({
        userId,
        lat: loc.lat,
        lng: loc.lng,
      });
      if (!exists) {
        await SavedLocation.create({
          userId,
          lat: loc.lat,
          lng: loc.lng,
          name: loc.name || 'Imported',
          placeName: loc.name,
        });
        locCount++;
      }
    }

    for (const m of markers) {
      await MapMarker.create({
        userId,
        lat: m.lat,
        lng: m.lng,
        name: m.name || 'Marker',
      });
      markCount++;
    }

    res.json({ ok: true, imported: { locations: locCount, markers: markCount } });
  } catch (error) {
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
