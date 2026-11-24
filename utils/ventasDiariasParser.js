// Lee el Excel diario "Comparador personalizado" (.xlsx) y devuelve un registro por local para el día del archivo.
//
//  · Datos: hoja "Por Local". Las columnas se identifican por su ENCABEZADO (no por posición) y las fechas se leen
//    de esos textos: "Venta 21 Octubre 2026", "Acum. Noviembre 2026", "Ticket Prom. (Nov 2026)", "GP % (Nov 2026)",
//    "Pedidos (Oct 2026)". De cada par, la fecha/mes MÁS RECIENTE es el del día del archivo y la anterior es la de
//    comparación. Las columnas de variación del Excel no se usan: las variaciones se calculan.
//  · División de cada local (opcional): hojas STGO, CONCE, PATIO STGO y LATIN, solo para saber a qué división pertenece.
//  · Cuadre (opcional): la suma de los locales debe coincidir con el TOTAL de la hoja "Por Division".
const ExcelJS = require('exceljs');

const HOJA = 'Por Local';
const HOJA_DIVISIONES = 'Por Division';
const HOJAS_DIVISION = { 'STGO': 'KAMI STGO', 'CONCE': 'KAMI CONCEPCIÓN', 'PATIO STGO': 'KAMI PATIO STGO', 'LATIN': 'LATIN' };
const MESES = { ene: 1, feb: 2, mar: 3, abr: 4, may: 5, jun: 6, jul: 7, ago: 8, sep: 9, set: 9, oct: 10, nov: 11, dic: 12 };

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();

const texto = (v) => {
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.result != null) return String(v.result);
    if (v.text != null) return String(v.text);
    if (v instanceof Date) return v.toISOString();
  }
  return String(v);
};
const numero = (v) => {
  if (v == null || v === '') return null;
  if (typeof v === 'object' && v.result != null) v = v.result;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const mesDe = (nombre) => MESES[norm(nombre).slice(0, 3)] || null;
const aaaamm = (anio, mes) => Number(anio) * 100 + mes;
const aaaammdd = (anio, mes, dia) => Number(anio) * 10000 + mes * 100 + Number(dia);
const fechaValida = (f) => {
  const d = new Date(Date.UTC(Math.floor(f / 10000), Math.floor((f % 10000) / 100) - 1, f % 100));
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate() === f;
};

// Clasifica un encabezado: { tipo, clave } o null si no es una columna que interese
function clasificar(encabezado) {
  const h = norm(encabezado);
  let m = h.match(/^venta (\d{1,2}) ([a-z]+) (\d{4})$/);
  if (m && mesDe(m[2])) return { tipo: 'venta', clave: aaaammdd(m[3], mesDe(m[2]), m[1]) };
  m = h.match(/^acum\.? ([a-z]+) (\d{4})$/);
  if (m && mesDe(m[1])) return { tipo: 'acum', clave: aaaamm(m[2], mesDe(m[1])) };
  m = h.match(/^ticket prom\.? ?\(([a-z]+) (\d{4})\)$/);
  if (m && mesDe(m[1])) return { tipo: 'ticket', clave: aaaamm(m[2], mesDe(m[1])) };
  m = h.match(/^gp ?% ?\(([a-z]+) (\d{4})\)$/);
  if (m && mesDe(m[1])) return { tipo: 'gp', clave: aaaamm(m[2], mesDe(m[1])) };
  m = h.match(/^pedidos \(([a-z]+) (\d{4})\)$/);
  if (m && mesDe(m[1])) return { tipo: 'pedidos', clave: aaaamm(m[2], mesDe(m[1])) };
  return null;
}

// Busca la fila de encabezados (la que empieza con "Local" o "División") y devuelve { fila, grupos }
function encabezados(ws) {
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const vals = ws.getRow(r).values;
    if (!['local', 'division'].includes(norm(texto(vals[1])))) continue; // "Local" (Por Local, STGO…) o "División" (Por Division)
    const grupos = {};
    for (let c = 2; c < vals.length; c++) {
      const k = clasificar(texto(vals[c]));
      if (k) (grupos[k.tipo] ||= []).push({ col: c, clave: k.clave });
    }
    for (const t of Object.keys(grupos)) grupos[t].sort((a, b) => a.clave - b.clave);
    return { fila: r, grupos };
  }
  return null;
}

function leerHoja(ws) {
  const enc = encabezados(ws);
  if (!enc) return null;
  const filas = [];
  for (let r = enc.fila + 1; r <= ws.rowCount; r++) {
    const vals = ws.getRow(r).values;
    const nombre = texto(vals[1]).trim();
    if (!nombre || nombre.toUpperCase() === 'TOTAL') continue;
    filas.push({ fila: r, nombre, vals });
  }
  return { enc, filas };
}

async function procesarExcelVentasDiarias(rutaArchivo, { divisionesPrevias = {} } = {}) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(rutaArchivo);
  const ws = wb.getWorksheet(HOJA);
  if (!ws) throw new Error(`El archivo no tiene la hoja "${HOJA}"`);

  const hoja = leerHoja(ws);
  if (!hoja) throw new Error(`En la hoja "${HOJA}" no se encontró la fila de encabezados (debe empezar con "Local")`);
  const { grupos } = hoja.enc;

  // Columnas requeridas: dos de cada una (fecha/mes anterior y actual), salvo GP % (basta el del mes actual)
  const faltan = [];
  for (const [t, etq] of [['venta', 'Venta (día)'], ['acum', 'Acum. (mes)'], ['ticket', 'Ticket Prom.'], ['pedidos', 'Pedidos']]) {
    if ((grupos[t] || []).length < 2) faltan.push(`${etq}: se esperan 2 columnas (la fecha anterior y la del día) y hay ${(grupos[t] || []).length}`);
  }
  if (!(grupos.gp || []).length) faltan.push('GP %');
  if (faltan.length) throw new Error(`Faltan columnas en "${HOJA}": ${faltan.join('; ')}`);

  const [vComp, vAct] = grupos.venta.slice(-2);
  const [aComp, aAct] = grupos.acum.slice(-2);
  const [tComp, tAct] = grupos.ticket.slice(-2);
  const [pComp, pAct] = grupos.pedidos.slice(-2);
  const gAct = grupos.gp[grupos.gp.length - 1];
  const fecha = vAct.clave;
  const fechaComp = vComp.clave;
  if (!fechaValida(fecha) || !fechaValida(fechaComp)) throw new Error('Las fechas de los encabezados "Venta …" no son válidas');
  if (fechaComp >= fecha) throw new Error('La fecha de comparación debe ser anterior a la del día del archivo');

  const advertencias = [];
  if (Math.floor(fecha / 100) !== aAct.clave) advertencias.push('El mes de "Acum." no coincide con el mes de la venta del día');

  // --- locales ---
  const registros = [];
  const vistos = new Map();
  const repetidos = new Set();
  let filasOmitidas = 0;
  let variacionesDistintas = 0;
  const encFila = Array.from(ws.getRow(hoja.enc.fila).values, (v) => norm(texto(v))); // Array.from rellena los huecos de la fila
  const iVarVenta = encFila.indexOf('variacion');
  const iVarAcum = encFila.findIndex((h) => h.startsWith('var. acum'));
  for (const { nombre, vals } of hoja.filas) {
    const v = (c) => numero(vals[c]);
    if (vistos.has(nombre)) { repetidos.add(nombre); continue; }
    const r = {
      sucursal: nombre, division: '', fecha, fechaComp, mes: Math.floor(fecha / 100), mesComp: aComp.clave, origen: 'archivo',
      ventaDia: v(vAct.col) ?? 0, ventaDiaComp: v(vComp.col) ?? 0,
      acumMes: v(aAct.col) ?? 0, acumMesComp: v(aComp.col) ?? 0,
      ticket: v(tAct.col), ticketComp: v(tComp.col),
      gp: v(gAct.col), pedidos: v(pAct.col) ?? 0, pedidosComp: v(pComp.col) ?? 0,
    };
    r.nuevo = r.ventaDiaComp === 0 && r.acumMesComp === 0 && r.pedidosComp === 0;
    // Control cruzado: la variación que trae el Excel debe coincidir con la calculada
    const cruz = (iCol, a, b) => { const f = iCol > 0 ? numero(vals[iCol]) : null; if (f != null && b > 0 && Math.abs(f - (a / b - 1)) > 0.005) variacionesDistintas++; };
    cruz(iVarVenta, r.ventaDia, r.ventaDiaComp);
    cruz(iVarAcum, r.acumMes, r.acumMesComp);
    vistos.set(nombre, r);
    registros.push(r);
  }
  if (repetidos.size) throw new Error(`Hay locales repetidos en "${HOJA}": ${[...repetidos].join(', ')}`);
  if (!registros.length) throw new Error(`La hoja "${HOJA}" no tiene locales`);

  // --- división de cada local (hojas STGO, CONCE, PATIO STGO, LATIN) ---
  const divDeHojas = new Map();
  for (const [nombreHoja, division] of Object.entries(HOJAS_DIVISION)) {
    const wsd = wb.getWorksheet(nombreHoja);
    const h = wsd && leerHoja(wsd);
    if (!h) continue;
    for (const { nombre } of h.filas) {
      if (divDeHojas.has(nombre) && divDeHojas.get(nombre) !== division) advertencias.push(`El local "${nombre}" aparece en más de una hoja de divisiones`);
      else divDeHojas.set(nombre, division);
    }
  }
  for (const r of registros) r.division = divDeHojas.get(r.sucursal) || divisionesPrevias[r.sucursal] || '';
  const sinDivision = registros.filter((r) => !r.division).map((r) => r.sucursal);
  if (sinDivision.length) advertencias.push(`${sinDivision.length} local(es) sin división asignada`);

  // --- cuadre con la hoja "Por Division" ---
  let cuadre = null;
  const wsDiv = wb.getWorksheet(HOJA_DIVISIONES);
  const hDiv = wsDiv && encabezados(wsDiv);
  if (hDiv && (hDiv.grupos.venta || []).length) {
    const colVenta = hDiv.grupos.venta.find((g) => g.clave === fecha);
    if (colVenta) {
      for (let r = hDiv.fila + 1; r <= wsDiv.rowCount; r++) {
        const vals = wsDiv.getRow(r).values;
        if (texto(vals[1]).trim().toUpperCase() !== 'TOTAL') continue;
        const totalHoja = numero(vals[colVenta.col]);
        const totalLocales = registros.reduce((s, x) => s + x.ventaDia, 0);
        if (totalHoja != null) cuadre = { ok: Math.abs(totalHoja - totalLocales) < 1, totalLocales, totalHoja, diferencia: totalLocales - totalHoja };
        break;
      }
    }
    if (cuadre && !cuadre.ok) advertencias.push(`La suma de los locales no coincide con el TOTAL de "${HOJA_DIVISIONES}" (diferencia ${Math.round(cuadre.diferencia)})`);
  }

  const gpSospechoso = registros.filter((r) => r.gp != null && (r.gp < 0.1 || r.gp > 1)).map((r) => ({ sucursal: r.sucursal, gp: r.gp }));
  if (variacionesDistintas) advertencias.push(`La variación del Excel difiere de la calculada en ${variacionesDistintas} celda(s)`);

  const porDivision = {};
  for (const r of registros) porDivision[r.division || 'SIN DIVISIÓN'] = (porDivision[r.division || 'SIN DIVISIÓN'] || 0) + 1;

  return {
    registros,
    resumen: {
      fecha, fechaComp, mes: Math.floor(fecha / 100), mesComp: aComp.clave,
      filas: registros.length + filasOmitidas, filasOmitidas, locales: registros.length,
      ventaTotal: registros.reduce((s, r) => s + r.ventaDia, 0),
      nuevos: registros.filter((r) => r.nuevo).map((r) => r.sucursal),
      gpSospechoso, sinDivision, divisiones: Object.entries(porDivision).map(([division, locales]) => ({ division, locales })),
      cuadre, variacionesDistintas, advertencias,
    },
  };
}

module.exports = { procesarExcelVentasDiarias, clasificar, aaaammdd };
