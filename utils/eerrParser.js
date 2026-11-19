// Lee la hoja EERR_Consolidado del Excel consolidado en modo streaming (sin cargar
// las ~360 mil filas en memoria) y la agrega por local y mes.
// Los totales por sección replican la Hoja3 del Excel (GETPIVOTDATA por sección).
// El margen se toma del concepto "Margen Neto" de la sección Resumen de cada local.
const ExcelJS = require('exceljs');

const HOJA = 'EERR_Consolidado';
const COLUMNAS = ['sucursal', 'un', 'analista', 'anio', 'mes_num', 'seccion', 'concepto', 'valor'];

// Sección de gasto del Excel -> campo agregado
const SECCIONES = {
  'Gastos_de_Producción': 'compras',
  'Gastos_Producción_Indirectos': 'gpi',
  'Gastos_de_Administración_y_ventas': 'adm',
  'Remuneraciones': 'rem',
};

// Unifica variantes de un mismo concepto ("Ventas Agua", "VENTAS AGUA", "propinaS"...)
// (sin "." ni "$" inicial, que Mongo no admite en claves de un Map)
const normalizarConcepto = (c) => String(c ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
  .replace(/\./g, '').replace(/^\$+/, '');

const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result != null) return String(v.result);
    if (v.text != null) return String(v.text);
  }
  return String(v);
};

const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.result != null) v = v.result;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

async function procesarExcelEerr(rutaArchivo) {
  const reader = new ExcelJS.stream.xlsx.WorkbookReader(rutaArchivo, {
    sharedStrings: 'cache',
    hyperlinks: 'ignore',
    styles: 'ignore',
    worksheets: 'emit',
    entries: 'emit',
  });

  const grupos = new Map(); // `${sucursal}||${periodo}` -> registro agregado
  const variantes = new Map(); // concepto normalizado -> escrituras originales
  let hojaEncontrada = false;
  let filas = 0;
  let filasOmitidas = 0;

  for await (const ws of reader) {
    if (ws.name !== HOJA) {
      for await (const _ of ws) { /* se descarta la hoja sin guardar nada */ }
      continue;
    }
    hojaEncontrada = true;
    let idx = null;

    for await (const row of ws) {
      const vals = row.values; // índice 1-based
      if (!idx) {
        const enc = vals.map((v) => texto(v).trim().toLowerCase());
        idx = {};
        for (const c of COLUMNAS) idx[c] = enc.indexOf(c);
        const faltan = COLUMNAS.filter((c) => idx[c] < 1);
        if (faltan.length) throw new Error(`Faltan columnas en ${HOJA}: ${faltan.join(', ')}`);
        continue;
      }

      const sucursal = texto(vals[idx.sucursal]).trim();
      const anio = numero(vals[idx.anio]);
      const mes = numero(vals[idx.mes_num]);
      if (!sucursal || !anio || !mes) { filasOmitidas++; continue; }
      filas++;
      const valor = numero(vals[idx.valor]);
      if (valor == null) continue;

      const seccion = texto(vals[idx.seccion]).trim();
      const conceptoOrig = texto(vals[idx.concepto]).trim();
      const periodo = anio * 100 + mes;
      const clave = `${sucursal}||${periodo}`;
      let g = grupos.get(clave);
      if (!g) {
        g = { sucursal, un: '', analista: '', anio, mes, periodo,
          ventasTotales: 0, ventasAgua: 0, despachos: 0, compras: 0, gpi: 0, adm: 0, rem: 0, margenNeto: 0, detalle: {} };
        grupos.set(clave, g);
      }
      const un = texto(vals[idx.un]).trim();
      const analista = texto(vals[idx.analista]).trim();
      if (un) g.un = un;
      if (analista) g.analista = analista;

      const concepto = normalizarConcepto(conceptoOrig);
      if (seccion === 'Ventas') {
        if (concepto === 'ventas totales') g.ventasTotales += valor;
        else if (concepto === 'ventas agua') g.ventasAgua += valor;
        continue;
      }
      if (seccion === 'Resumen') {
        if (concepto === 'margen neto') g.margenNeto += valor;
        continue;
      }
      const campo = SECCIONES[seccion];
      if (!campo) continue; // "Resumen %" no se usa
      g[campo] += valor;
      if (campo === 'rem' && concepto === 'despachos') g.despachos += valor;

      const k = `${campo}|${concepto}`;
      g.detalle[k] = (g.detalle[k] || 0) + valor;
      if (!variantes.has(concepto)) variantes.set(concepto, new Set());
      variantes.get(concepto).add(conceptoOrig);
    }
  }

  if (!hojaEncontrada) throw new Error(`El archivo no tiene la hoja "${HOJA}"`);
  if (!grupos.size) throw new Error(`La hoja "${HOJA}" no tiene datos válidos`);

  const registros = [...grupos.values()];
  const periodos = [...new Set(registros.map((r) => r.periodo))].sort((a, b) => a - b);

  return {
    registros,
    resumen: {
      filas,
      filasOmitidas,
      locales: new Set(registros.map((r) => r.sucursal)).size,
      grupos: [...new Set(registros.map((r) => r.un).filter(Boolean))].sort(),
      analistas: [...new Set(registros.map((r) => r.analista).filter(Boolean))].sort(),
      periodos,
      conceptosUnificados: [...variantes.entries()]
        .filter(([, s]) => s.size > 1)
        .map(([concepto, s]) => ({ concepto, variantes: [...s] })),
    },
  };
}

module.exports = { procesarExcelEerr, normalizarConcepto };
