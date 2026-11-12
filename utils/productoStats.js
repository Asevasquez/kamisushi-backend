// backend/utils/productoStats.js
//
// Cálculos del dashboard de Auditoría de Producto. Funciones puras (reciben las auditorías
// ya leídas de la base), para poder probarlas sin base de datos.
const C = require('./productoChecklist');

const promedio = (nums) => {
  const v = nums.filter((x) => typeof x === 'number' && !Number.isNaN(x));
  return v.length ? C.redondear1(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

// La sección con menor porcentaje; a igualdad gana la primera del checklist. null si ninguna aplica.
function seccionMasDebil(secciones) {
  let peor = null;
  for (const s of secciones || []) {
    if (typeof s.porcentaje !== 'number') continue;
    if (!peor || s.porcentaje < peor.porcentaje) peor = { id: s.id, nombre: s.nombre, porcentaje: s.porcentaje };
  }
  return peor;
}

const mesDe = (fecha) => new Date(fecha).toISOString().slice(0, 7);

// docs: auditorías (objetos planos) con localId, localNombre, fechaAuditoria, porcentajeTotal, categoria, secciones[]
function resumirAuditorias(docs) {
  const porcentajes = docs.map((d) => d.porcentajeTotal);
  const prom = promedio(porcentajes);

  // Por local: promedio de sus auditorías del período y de cada sección
  const mapa = new Map();
  for (const d of docs) {
    const k = String(d.localId);
    if (!mapa.has(k)) mapa.set(k, { localId: k, localNombre: d.localNombre, docs: [] });
    mapa.get(k).docs.push(d);
  }
  const locales = [...mapa.values()].map((l) => {
    const porcentaje = promedio(l.docs.map((d) => d.porcentajeTotal));
    const secciones = {};
    for (const def of C.SECCIONES) {
      secciones[def.id] = promedio(l.docs.map((d) => (d.secciones || []).find((s) => s.id === def.id)?.porcentaje));
    }
    const ultima = l.docs.reduce((a, d) => (new Date(d.fechaAuditoria) > new Date(a) ? d.fechaAuditoria : a), l.docs[0].fechaAuditoria);
    return {
      localId: l.localId, localNombre: l.localNombre, auditorias: l.docs.length,
      porcentaje, categoria: C.categoriaDe(porcentaje), ultimaFecha: ultima, secciones,
      seccionMasDebil: seccionMasDebil(C.SECCIONES.map((def) => ({ id: def.id, nombre: def.nombre, porcentaje: secciones[def.id] }))),
    };
  }).sort((a, b) => (a.porcentaje ?? 999) - (b.porcentaje ?? 999) || String(a.localNombre).localeCompare(String(b.localNombre), 'es'));

  // Cumplimiento por sección (promedio de las auditorías en que la sección aplicó)
  const porSeccion = C.SECCIONES.map((def) => {
    const filas = docs.map((d) => (d.secciones || []).find((s) => s.id === def.id)).filter(Boolean);
    const pct = promedio(filas.map((s) => s.porcentaje));
    return {
      id: def.id, nombre: def.nombre, preguntas: def.preguntas.length,
      porcentaje: pct, categoria: C.categoriaDe(pct),
      auditorias: filas.filter((s) => typeof s.porcentaje === 'number').length,
      si: filas.reduce((a, s) => a + (s.si || 0), 0),
      no: filas.reduce((a, s) => a + (s.no || 0), 0),
      na: filas.reduce((a, s) => a + (s.na || 0), 0),
    };
  });

  const distribucion = C.CATEGORIAS.map((categoria) => ({ categoria, cantidad: docs.filter((d) => d.categoria === categoria).length }));

  return {
    totalAuditorias: docs.length,
    totalLocales: locales.length,
    promedioGeneral: prom,
    categoriaGeneral: C.categoriaDe(prom),
    localesBajo70: locales.filter((l) => typeof l.porcentaje === 'number' && l.porcentaje < 70).length,
    seccionMasDebil: seccionMasDebil(porSeccion),
    distribucion,
    porSeccion,
    locales,
  };
}

// Promedio por mes de los últimos n meses terminando en hastaMes ('YYYY-MM')
function serieMensual(docs, hastaMes, n = 6) {
  const [y, m] = hastaMes.split('-').map(Number);
  const claves = [];
  for (let i = n - 1; i >= 0; i--) claves.push(new Date(Date.UTC(y, m - 1 - i, 1)).toISOString().slice(0, 7));
  return claves.map((mes) => {
    const delMes = docs.filter((d) => mesDe(d.fechaAuditoria) === mes);
    return { mes, auditorias: delMes.length, porcentaje: promedio(delMes.map((d) => d.porcentajeTotal)) };
  });
}

function mesesConDatos(docs) {
  return [...new Set(docs.map((d) => mesDe(d.fechaAuditoria)))].sort().reverse();
}

module.exports = { promedio, seccionMasDebil, resumirAuditorias, serieMensual, mesesConDatos, mesDe };
