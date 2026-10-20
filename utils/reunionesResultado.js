// Helpers de Reuniones de Resultado: estado visible (vencido), cumplimiento y categorías.

const SECCION_LABEL = {
  servicio_cliente: 'Servicio al Cliente',
  finanzas: 'Finanzas',
  operaciones: 'Operaciones',
};

// ⚠️ Umbrales: reemplazar por la MISMA función que usan Revisiones/Auditoría/Mentorías
// para que las categorías sean consistentes en todo el sistema.
const categoriaCumplimiento = (pct) => {
  if (pct === null || pct === undefined) return null;
  if (pct >= 90) return 'EXCELENTE';
  if (pct >= 80) return 'MUY BUENO';
  if (pct >= 70) return 'BUENO';
  if (pct >= 60) return 'REGULAR';
  if (pct >= 50) return 'MALO';
  return 'PÉSIMO';
};

const inicioDeHoy = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

// Vencido = sin evidencia en revisión ni aprobada, y la fecha límite ya pasó (el día límite cuenta completo).
const estadoVisible = (c, hoy = inicioDeHoy()) => {
  if ((c.estado === 'pendiente' || c.estado === 'rechazado') && c.fechaLimite && new Date(c.fechaLimite) < hoy) {
    return 'vencido';
  }
  return c.estado;
};

const contar = (compromisos = []) => {
  const hoy = inicioDeHoy();
  const r = { total: 0, pendiente: 0, en_revision: 0, aprobado: 0, rechazado: 0, vencido: 0 };
  for (const c of compromisos) {
    r.total += 1;
    r[estadoVisible(c, hoy)] += 1;
  }
  r.pct = r.total ? Math.round((r.aprobado / r.total) * 100) : null;
  r.categoria = categoriaCumplimiento(r.pct);
  return r;
};

const resumenReunion = (compromisos = []) => {
  const porSeccion = {};
  for (const s of Object.keys(SECCION_LABEL)) {
    porSeccion[s] = contar(compromisos.filter((c) => c.seccion === s));
  }
  return { general: contar(compromisos), porSeccion };
};

module.exports = { SECCION_LABEL, categoriaCumplimiento, estadoVisible, contar, resumenReunion, inicioDeHoy };
