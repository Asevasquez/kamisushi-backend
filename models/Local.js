const mongoose = require('mongoose');

const localSchema = new mongoose.Schema({
  nombre: { type: String, required: true, unique: true },
  direccion: { type: String, required: true },
  ciudad: { type: String, required: true },
  activo: { type: Boolean, default: true },
  // Código/ID propio del negocio (ej. sistema de franquicias, POS, etc.),
  // distinto del _id interno de Mongo. Opcional: no todos los locales
  // existentes lo tendrán al principio. "sparse" hace que el índice único
  // solo aplique entre los locales que SÍ tienen un valor — así pueden
  // convivir muchos locales sin código sin chocar entre sí.
  codigoExterno: { type: String, trim: true },
});

localSchema.index({ codigoExterno: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Local', localSchema);