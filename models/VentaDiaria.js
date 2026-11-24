const mongoose = require('mongoose');

// Un documento por local y día. Sale de la hoja "Por Local" del Excel diario: trae la venta del día, los acumulados del
// mes, el ticket promedio, el GP % y los pedidos, cada uno con su valor de comparación (la fecha/mes anterior que
// indica el propio archivo). Los pedidos y el ticket son ACUMULADOS DEL MES: el Excel no los trae por día.
const ventaDiariaSchema = new mongoose.Schema({
  sucursal: { type: String, required: true },
  division: { type: String, default: '' },     // KAMI STGO, KAMI CONCEPCIÓN, KAMI PATIO STGO, LATIN
  fecha: { type: Number, required: true },      // AAAAMMDD del día
  fechaComp: { type: Number },                  // AAAAMMDD de la fecha de comparación que indica el archivo
  mes: { type: Number },                        // AAAAMM de la fecha
  mesComp: { type: Number },                    // AAAAMM del mes de comparación
  // 'archivo' = viene de un Excel de ese día; 'comparacion' = solo la venta de un día de comparación (para el historial)
  origen: { type: String, enum: ['archivo', 'comparacion'], default: 'archivo' },
  ventaDia: { type: Number, default: 0 },
  ventaDiaComp: { type: Number, default: 0 },
  acumMes: { type: Number, default: 0 },
  acumMesComp: { type: Number, default: 0 },
  ticket: { type: Number, default: null },
  ticketComp: { type: Number, default: null },
  gp: { type: Number, default: null },          // GP % del mes actual (fracción, ej. 0.44)
  pedidos: { type: Number, default: 0 },
  pedidosComp: { type: Number, default: 0 },
  nuevo: { type: Boolean, default: false },     // local sin ventas en el período de comparación
  carga: { type: mongoose.Schema.Types.ObjectId, ref: 'VentasDiariasCarga' },
}, { timestamps: true });

ventaDiariaSchema.index({ sucursal: 1, fecha: 1 }, { unique: true });
ventaDiariaSchema.index({ fecha: 1 });

module.exports = mongoose.model('VentaDiaria', ventaDiariaSchema);
