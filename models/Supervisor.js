const mongoose = require('mongoose');

const supervisorSchema = new mongoose.Schema({
  nombre: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  telefono: { type: String },
  fechaContratacion: { type: Date, default: Date.now },
  activo: { type: Boolean, default: true },
});

module.exports = mongoose.model('Supervisor', supervisorSchema);
