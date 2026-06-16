const mongoose = require('mongoose');
const { isJsonMode } = require('../db');
const jsonDb = require('../services/jsonDb');

const savedLocationSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  name: { type: String, default: 'Saved Location' },
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },
  placeName: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const MongoSavedLocation = mongoose.models.SavedLocation || mongoose.model('SavedLocation', savedLocationSchema);

class JsonSavedLocation {
  static find(filter = {}) {
    return jsonDb.find('SavedLocation', filter);
  }

  static findOne(filter = {}) {
    return jsonDb.findOne('SavedLocation', filter);
  }

  static async create(data = {}) {
    const saved = jsonDb.insert('SavedLocation', {
      userId: data.userId,
      name: data.name || 'Saved Location',
      lat: Number(data.lat),
      lng: Number(data.lng),
      placeName: data.placeName || '',
    });
    return saved;
  }

  static async deleteOne(filter = {}) {
    return jsonDb.deleteOne('SavedLocation', filter);
  }

  static async deleteMany(filter = {}) {
    return jsonDb.deleteMany('SavedLocation', filter);
  }

  static async countDocuments(filter = {}) {
    return jsonDb.countDocuments('SavedLocation', filter);
  }
}

module.exports = new Proxy(MongoSavedLocation, {
  get(target, prop) {
    if (isJsonMode() && prop in JsonSavedLocation) {
      const value = JsonSavedLocation[prop];
      return typeof value === 'function' ? value.bind(JsonSavedLocation) : value;
    }
    const value = target[prop];
    return typeof value === 'function' ? value.bind(target) : value;
  },
});
