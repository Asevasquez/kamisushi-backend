const mongoose = require('mongoose');

const localSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  direccion: { type: String, required: true },
  ciudad: { type: String, required: true },
  activo: { type: Boolean, default: true }
});

module.exports = mongoose.model('Local', localSchema);