// backend/utils/geoRevision.js
//
// Regla de la ubicación/hora de una revisión: INICIO y FIN se fijan UNA sola vez.
//
//   · inicio: lo manda la app al crear la revisión (primer guardado). Una vez
//     guardado, ya no cambia aunque se retome el borrador o se edite después.
//   · fin: se fija al finalizar por primera vez. Guardar un borrador o editar
//     una revisión ya finalizada NO lo toca.
//
// Antes, cada guardado reemplazaba la geolocalización completa con lo que traía
// la app (que re-captura al abrir la pantalla y al tocar "Actualizar"), así que
// las horas dependían de la última edición y no de la revisión real.
const vacia = () => ({ latitude: null, longitude: null, accuracy: null, timestamp: null });

const numero = (v) => (v === null || v === undefined || v === '' ? NaN : Number(v));

// Normaliza un punto que llega de la app. Devuelve null si no trae nada útil.
// La hora puede venir sin coordenadas (GPS apagado o sin permiso): la hora sola ya sirve.
function limpiarPunto(p) {
  if (!p || typeof p !== 'object') return null;
  const lat = numero(p.latitude);
  const lon = numero(p.longitude);
  // (0, 0) es "Null Island": un valor por defecto, no una ubicación real
  const tieneCoord = Number.isFinite(lat) && Number.isFinite(lon)
    && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  const ts = p.timestamp ? new Date(p.timestamp) : null;
  const tsValido = !!ts && !isNaN(ts.getTime());
  if (!tieneCoord && !tsValido) return null;
  const acc = numero(p.accuracy);
  return {
    latitude: tieneCoord ? lat : null,
    longitude: tieneCoord ? lon : null,
    accuracy: tieneCoord && Number.isFinite(acc) ? acc : null,
    timestamp: tsValido ? ts : null,
  };
}

const tienePunto = (p) => !!(p && (p.timestamp || (p.latitude !== null && p.latitude !== undefined)));

// actual: lo que ya tiene guardada la revisión (o null si es nueva)
// entrante: lo que manda la app ({ inicio, fin })
// finalizando: true solo al finalizar (borrador → finalizada, o creación ya finalizada)
function mezclarGeolocalizacion(actual, entrante, { finalizando = false } = {}) {
  const act = actual || {};
  const ent = entrante || {};

  const inicio = tienePunto(act.inicio) ? act.inicio : (limpiarPunto(ent.inicio) || vacia());

  let fin;
  if (tienePunto(act.fin)) fin = act.fin;                                   // ya finalizada: no se toca
  else if (finalizando) fin = limpiarPunto(ent.fin) || vacia();             // primera finalización
  else fin = vacia();                                                       // borrador o edición: sin fin nuevo

  return { inicio, fin };
}

// Duración en minutos entre inicio y fin. null si falta algún dato o las horas son incoherentes.
function duracionMinutos(geo) {
  const i = geo?.inicio?.timestamp;
  const f = geo?.fin?.timestamp;
  if (!i || !f) return null;
  const diff = new Date(f) - new Date(i);
  if (isNaN(diff) || diff < 0) return null;
  return Math.round(diff / 60000);
}

// Para pasar la geolocalización de un documento de Mongoose a un objeto simple.
function geoPlana(doc) {
  const o = doc && typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return o ? o.geolocalizacion : null;
}

module.exports = { mezclarGeolocalizacion, limpiarPunto, duracionMinutos, geoPlana, vacia };
