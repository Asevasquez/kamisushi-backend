const mongoose = require('mongoose');

// Historial de archivos cargados al módulo Ventas Diarias.
const cargaSchema = new mongoose.Schema({
  archivo: { type: String, required: true },
  tamano: Number,
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
  usuarioNombre: String,
  modo: { type: String, enum: ['reemplazar', 'agregar'], default: 'reemplazar' },
  fecha: Number,        // AAAAMMDD del día cargado
  fechaComp: Number,    // AAAAMMDD de la comparación
  locales: Number,
  registros: Number,
  registrosComp: Number, // registros del día de comparación guardados (solo su venta)
  ventaTotal: Number,
  nuevos: Number,
  cuadreOk: Boolean,     // null si el Excel no traía la hoja "Por Division"
  advertencias: Number,
}, { timestamps: true });

module.exports = mongoose.model('VentasDiariasCarga', cargaSchema);
