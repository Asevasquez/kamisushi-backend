// backend/utils/auditoriaIndependiente.js
//
// Datos de una auditoría hecha SIN supervisión previa: el auditor elige el
// local, la fecha (por defecto hoy) y, si quiere, escribe el nombre de la
// supervisora a cargo.
const MAX_SUPERVISORA = 80;
const DIA_MS = 24 * 60 * 60 * 1000;

function normalizarSupervisora(valor) {
  return String(valor || '').trim().replace(/\s+/g, ' ').slice(0, MAX_SUPERVISORA);
}

// La app manda la fecha a mediodía del día elegido; se acepta hasta 24 h hacia
// adelante (por la diferencia de zona horaria) y hasta un año hacia atrás.
function normalizarFechaAuditoria(valor, ahora = new Date()) {
  if (valor === undefined || valor === null || valor === '') return { ok: true, fecha: ahora };
  const fecha = new Date(valor);
  if (isNaN(fecha.getTime())) return { ok: false, error: 'La fecha de la auditoría no es válida' };
  if (fecha.getTime() > ahora.getTime() + DIA_MS) return { ok: false, error: 'La fecha de la auditoría no puede ser futura' };
  if (fecha.getTime() < ahora.getTime() - 366 * DIA_MS) return { ok: false, error: 'La fecha de la auditoría es demasiado antigua' };
  return { ok: true, fecha };
}

// local: documento del local (o null si no existe)
function datosAuditoriaIndependiente(body, local, ahora = new Date()) {
  if (!local) return { ok: false, status: 404, error: 'El local a auditar no existe' };
  if (local.activo === false) return { ok: false, status: 400, error: 'El local está inactivo' };
  const f = normalizarFechaAuditoria(body && body.fechaAuditoria, ahora);
  if (!f.ok) return { ok: false, status: 400, error: f.error };
  return {
    ok: true,
    datos: {
      localId: local._id,
      localNombre: local.nombre,
      supervisorNombre: normalizarSupervisora(body && body.supervisorNombre),
      fechaAuditoria: f.fecha,
    },
  };
}

module.exports = { normalizarSupervisora, normalizarFechaAuditoria, datosAuditoriaIndependiente, MAX_SUPERVISORA };
