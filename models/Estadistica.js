const mongoose = require('mongoose');

const estadisticaSchema = new mongoose.Schema({
  localId: { type: mongoose.Schema.Types.ObjectId, ref: 'Local', required: true },
  periodo: {
    type: String,
    enum: ['diario', 'semanal', 'mensual', 'trimestral', 'anual'],
    required: true
  },
  fecha: { type: Date, required: true },
  datos: {
    totalRevisiones: { type: Number, default: 0 },
    promedioPorcentaje: { type: Number, default: 0 },
    distribucionCategorias: {
      EXCELENTE: { type: Number, default: 0 },
      'MUY BUENO': { type: Number, default: 0 },
      BUENO: { type: Number, default: 0 },
      REGULAR: { type: Number, default: 0 },
      MALO: { type: Number, default: 0 },
      PÉSIMO: { type: Number, default: 0 }
    },
    evolucion: [{
      fecha: Date,
      porcentaje: Number,
      total: Number
    }],
    topIncidencias: [{
      tipo: String,
      count: Number,
      seccion: String
    }],
    porSupervisor: [{
      supervisorId: String,
      supervisorNombre: String,
      total: Number,
      promedio: Number
    }]
  },
  actualizadoEn: { type: Date, default: Date.now }
});

estadisticaSchema.index({ localId: 1, periodo: 1, fecha: 1 });

module.exports = mongoose.model('Estadistica', estadisticaSchema);