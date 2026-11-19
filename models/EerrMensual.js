const mongoose = require('mongoose');

// Un documento por local y mes, ya agregado desde la hoja EERR_Consolidado.
const eerrMensualSchema = new mongoose.Schema({
  sucursal: { type: String, required: true },
  un: { type: String, default: '' },          // Grupo de locales (KAMI, CONCEPCION, LATIN, PATIO)
  analista: { type: String, default: '' },
  anio: { type: Number, required: true },
  mes: { type: Number, required: true },
  periodo: { type: Number, required: true },  // anio*100 + mes, ej. 202610
  ventasTotales: { type: Number, default: 0 },
  ventasAgua: { type: Number, default: 0 },
  despachos: { type: Number, default: 0 },
  compras: { type: Number, default: 0 },      // sección Gastos_de_Producción
  gpi: { type: Number, default: 0 },          // sección Gastos_Producción_Indirectos
  adm: { type: Number, default: 0 },          // sección Gastos_de_Administración_y_ventas
  rem: { type: Number, default: 0 },          // sección Remuneraciones (incluye despachos)
  margenNeto: { type: Number, default: 0 },   // concepto "Margen Neto" de la sección Resumen
  detalle: { type: Map, of: Number, default: {} }, // "campo|concepto" -> valor
  carga: { type: mongoose.Schema.Types.ObjectId, ref: 'EerrCarga' },
}, { timestamps: true });

eerrMensualSchema.index({ sucursal: 1, periodo: 1 }, { unique: true });
eerrMensualSchema.index({ periodo: 1 });

module.exports = mongoose.model('EerrMensual', eerrMensualSchema);
