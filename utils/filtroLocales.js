// Filtro de locales de GET /revisiones.
//
// El cliente puede pedir un local (localId) o varios (localIds, separados por coma). Este filtro nunca amplía
// lo que la persona puede ver: si pide un local fuera de los que tiene permitidos (administrador, supervisor
// interno, mentor) se responde 403, igual que antes con un solo local.
const mongoose = require('mongoose');

const ES_ID = /^[0-9a-fA-F]{24}$/;

function localesPedidos({ localId, localIds } = {}) {
  const lista = [];
  if (localId) lista.push(String(localId));
  if (localIds) lista.push(...(Array.isArray(localIds) ? localIds : String(localIds).split(',')));
  return [...new Set(lista.map((s) => String(s).trim()).filter(Boolean))];
}

// localesPermitidos: null = sin restricción (master/gerencia/supervisor), o la lista de ids que puede ver.
// → { error: { status, mensaje } } | { filtro } (valor para query.localId; null = sin filtro de local)
function resolverFiltroLocales(query, localesPermitidos) {
  const pedidos = localesPedidos(query);
  if (pedidos.some((id) => !ES_ID.test(id))) return { error: { status: 400, mensaje: 'Local inválido' } };
  const permitidos = localesPermitidos ? localesPermitidos.map(String) : null;
  if (pedidos.length) {
    if (permitidos && pedidos.some((id) => !permitidos.includes(id))) {
      return { error: { status: 403, mensaje: 'No tienes acceso a este local' } };
    }
    const ids = pedidos.map((id) => new mongoose.Types.ObjectId(id));
    return { filtro: ids.length === 1 ? ids[0] : { $in: ids } };
  }
  if (permitidos) return { filtro: { $in: permitidos.map((id) => new mongoose.Types.ObjectId(id)) } };
  return { filtro: null };
}

module.exports = { resolverFiltroLocales, localesPedidos };
