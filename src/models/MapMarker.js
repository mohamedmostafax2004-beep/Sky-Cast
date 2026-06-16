const mongoose = require('mongoose');
const { isJsonMode } = require('../db');
const jsonDb = require('../services/jsonDb');

const mapMarkerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: 'Marker' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  color: { type: String, default: '#472dbb' },
  notes: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

const MongoMapMarker = mongoose.models.MapMarker || mongoose.model('MapMarker', mapMarkerSchema);

class JsonMapMarker {
  static find(filter = {}) {
    return jsonDb.find('MapMarker', filter);
  }

  static findOne(filter = {}) {
    return jsonDb.findOne('MapMarker', filter);
  }

  static async create(data = {}) {
    return jsonDb.insert('MapMarker', {
      userId: data.userId,
      name: data.name || 'Marker',
      lat: Number(data.lat),
      lng: Number(data.lng),
      color: data.color || '#472dbb',
      notes: data.notes || '',
    });
  }

  static async deleteOne(filter = {}) {
    return jsonDb.deleteOne('MapMarker', filter);
  }

  static async deleteMany(filter = {}) {
    return jsonDb.deleteMany('MapMarker', filter);
  }

  static async countDocuments(filter = {}) {
    return jsonDb.countDocuments('MapMarker', filter);
  }
}

module.exports = new Proxy(MongoMapMarker, {
  get(target, prop) {
    if (isJsonMode() && prop in JsonMapMarker) {
      const value = JsonMapMarker[prop];
      return typeof value === 'function' ? value.bind(JsonMapMarker) : value;
    }
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
