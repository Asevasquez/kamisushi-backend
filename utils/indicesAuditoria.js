// backend/utils/indicesAuditoria.js
//
// Índice de "una auditoría por revisión", ahora PARCIAL: solo vale para las
// auditorías que tienen supervisión previa (revisionId). Las auditorías sin
// supervisión previa no tienen ese campo y pueden ser muchas.
//
// Mongoose no cambia un índice que ya existe con otras opciones, así que esta
// función reemplaza el índice antiguo (único sobre todos los documentos) por el
// parcial, una sola vez y de forma segura. Es idempotente: si ya está bien, no
// hace nada.
const NOMBRE = 'revisionId_1';

async function asegurarIndiceRevision(collection, log = console) {
  try {
    let existentes = [];
    try {
      existentes = await collection.indexes();
    } catch (e) {
      // La colección aún no existe (instalación nueva): se crea con el índice
      if (e.codeName !== 'NamespaceNotFound' && e.code !== 26) throw e;
    }

    const actual = existentes.find((i) => i.name === NOMBRE);
    const esParcial = !!actual && !!actual.partialFilterExpression;
    if (actual && !esParcial) {
      await collection.dropIndex(NOMBRE);
      log.log('Auditoría: índice antiguo de revisionId reemplazado (ahora se pueden crear auditorías sin supervisión previa)');
    }
    if (!actual || !esParcial) {
      await collection.createIndex(
        { revisionId: 1 },
        { name: NOMBRE, unique: true, partialFilterExpression: { revisionId: { $type: 'objectId' } } }
      );
    }
    return true;
  } catch (e) {
    log.error('Auditoría: no se pudo asegurar el índice de revisionId:', e.message);
    return false;
  }
}

module.exports = { asegurarIndiceRevision, NOMBRE_INDICE_REVISION: NOMBRE };
