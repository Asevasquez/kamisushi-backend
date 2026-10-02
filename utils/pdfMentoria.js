// ────────────────────────────────────────────────────────────
// PDF del Informe de Mentoría (PDFKit, A4).
// Notas aprendidas en el PDF de Auditoría:
//  - Helvetica no soporta emojis: solo texto plano.
//  - El pie se escribe al final con bufferPages y margen inferior en 0,
//    para que PDFKit no cree páginas en blanco al escribir fuera del margen.
// ────────────────────────────────────────────────────────────
const PDFDocument = require('pdfkit');
const {
  PUNTAJE_MAX_TOTAL,
  PUNTAJE_MAX_PREGUNTA,
  UMBRAL_PLAN_ACCION,
  preguntaPorNumero,
} = require('../config/mentoriaPreguntas');

const C = {
  rojo: '#B71C1C',
  rojoClaro: '#FFE3E0',
  azul: '#1E5AA8',
  naranja: '#C2410C',
  tinta: '#1A1A1A',
  texto: '#3D3D3D',
  gris: '#5C5C5C',
  borde: '#D9D4CF',
  fondo: '#F6F4F2',
  fondoNaranja: '#FFF4EE',
};

const M = 40;          // margen lateral / superior
const ALTO_PIE = 34;   // espacio reservado abajo para el pie de página
const TZ = 'America/Santiago';

const ESTADO_TXT = { abierto: 'Abierto', en_revision: 'En revisión', cerrado: 'Cerrado' };

function fmtFecha(d) {
  if (!d) return '—';
  const f = new Date(d);
  if (isNaN(f)) return '—';
  const dd = f.toLocaleDateString('es-CL', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
  return dd.replace(/\//g, '-');
}

function fmtHora(d) {
  if (!d) return '—';
  const f = new Date(d);
  if (isNaN(f)) return '—';
  return f.toLocaleTimeString('es-CL', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
}

function fmtDuracion(ini, fin) {
  if (!ini || !fin) return '—';
  const min = Math.round((new Date(fin) - new Date(ini)) / 60000);
  if (!(min > 0)) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}

function colorCategoria(pct) {
  if (pct >= 80) return C.azul;
  if (pct >= 60) return C.naranja;
  return C.rojo;
}

function colorPuntaje(p) {
  return p !== null && p !== undefined && p >= UMBRAL_PLAN_ACCION ? C.azul : C.naranja;
}

// ────────────────────────────────────────────────────────────

function generarPdfMentoria(m, destino, opciones = {}) {
  const { ocultarObservacionesSinFiltro = false } = opciones;

  const doc = new PDFDocument({
    size: 'A4',
    bufferPages: true,
    margins: { top: M, left: M, right: M, bottom: M + ALTO_PIE },
    info: {
      Title: `Informe de Mentoría ${m.numeroInforme || ''} - ${m.localNombre || ''}`,
      Author: 'KamiSushi Supervisión',
    },
  });
  doc.pipe(destino);

  const W = doc.page.width;
  const H = doc.page.height;
  const ancho = W - 2 * M;
  const limiteInferior = () => H - M - ALTO_PIE;

  // Encabezado corto en todas las páginas siguientes a la primera
  const encabezadoContinuo = () => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.rojo)
      .text('KAMISUSHI · INFORME DE MENTORÍA', M, M, { width: ancho / 2, lineBreak: false });
    doc.font('Helvetica').fontSize(9).fillColor(C.gris)
      .text(`${m.localNombre || ''} · ${fmtFecha(m.fechaMentoria)} · N° ${m.numeroInforme || '—'}`,
        M + ancho / 2, M, { width: ancho / 2, align: 'right', lineBreak: false });
    doc.moveTo(M, M + 16).lineTo(W - M, M + 16).lineWidth(2).strokeColor(C.rojo).stroke();
    doc.x = M;
    doc.y = M + 30;
  };
  doc.on('pageAdded', encabezadoContinuo);

  const asegurarEspacio = (alto) => {
    if (doc.y + alto > limiteInferior()) doc.addPage();
  };

  const tituloSeccion = (txt, sub) => {
    asegurarEspacio(50);
    doc.font('Helvetica-Bold').fontSize(14).fillColor(C.tinta).text(txt, M, doc.y, { width: ancho });
    if (sub) {
      doc.moveDown(0.2);
      doc.font('Helvetica').fontSize(9).fillColor(C.gris).text(sub, M, doc.y, { width: ancho });
    }
    doc.moveDown(0.7);
  };

  // ── Página 1: encabezado grande ─────────────────────────────
  doc.rect(0, 0, W, 86).fill(C.rojo);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(C.rojoClaro)
    .text('KAMISUSHI', M, 26, { characterSpacing: 1.2, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF')
    .text('Informe de Mentoría', M, 40, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF')
    .text(`N° ${m.numeroInforme || '—'}`, M, 32, { width: ancho, align: 'right', lineBreak: false });
  doc.font('Helvetica').fontSize(9).fillColor(C.rojoClaro)
    .text(`Emitido ${fmtFecha(m.fechaFinalizacion || new Date())}`, M, 48, { width: ancho, align: 'right', lineBreak: false });

  // ── Datos de la visita (grilla 3 x 2) ───────────────────────
  let y = 106;
  const celdaW = ancho / 3;
  const celdaH = 40;
  const datos = [
    ['Local', m.localNombre || '—'],
    ['Mentor', m.mentorNombre || '—'],
    ['Alumno (administrador)', m.alumnoNombre || '—'],
    ['Fecha', fmtFecha(m.fechaMentoria)],
    ['Horario', `${fmtHora(m.fechaMentoria)} – ${fmtHora(m.fechaFin)}`],
    ['Duración', fmtDuracion(m.fechaMentoria, m.fechaFin)],
  ];
  doc.lineWidth(1).strokeColor(C.borde).roundedRect(M, y, ancho, celdaH * 2, 6).stroke();
  doc.moveTo(M, y + celdaH).lineTo(M + ancho, y + celdaH).stroke();
  doc.moveTo(M + celdaW, y).lineTo(M + celdaW, y + celdaH * 2).stroke();
  doc.moveTo(M + celdaW * 2, y).lineTo(M + celdaW * 2, y + celdaH * 2).stroke();
  datos.forEach(([lbl, val], i) => {
    const cx = M + (i % 3) * celdaW + 10;
    const cy = y + Math.floor(i / 3) * celdaH + 7;
    doc.font('Helvetica').fontSize(8).fillColor(C.gris).text(lbl, cx, cy, { width: celdaW - 20, lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(C.tinta)
      .text(val, cx, cy + 12, { width: celdaW - 20, lineBreak: false, ellipsis: true });
  });
  y += celdaH * 2 + 16;

  // ── Resultado ───────────────────────────────────────────────
  const pct = Number(m.porcentaje) || 0;
  const colCat = colorCategoria(pct);
  const bajoUmbral = (m.preguntas || []).filter((p) => p.puntaje !== null && p.puntaje < UMBRAL_PLAN_ACCION).length;
  const cantCompromisos = (m.compromisos || []).length;

  doc.roundedRect(M, y, ancho, 78, 8).fill(C.fondo);
  doc.font('Helvetica').fontSize(9).fillColor(C.gris).text('Cumplimiento', M + 16, y + 14, { lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(32).fillColor(colCat).text(`${pct}%`, M + 16, y + 28, { lineBreak: false });

  const rx = M + 160;
  const rw = ancho - 160 - 16;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(C.tinta)
    .text(`${m.puntajeTotal || 0} / ${PUNTAJE_MAX_TOTAL} puntos`, rx, y + 14, { lineBreak: false });
  const cat = m.categoria || '—';
  doc.font('Helvetica-Bold').fontSize(9);
  const catW = doc.widthOfString(cat) + 20;
  doc.roundedRect(rx + rw - catW, y + 11, catW, 18, 9).fill(colCat);
  doc.fillColor('#FFFFFF').text(cat, rx + rw - catW, y + 16, { width: catW, align: 'center', lineBreak: false });
  doc.roundedRect(rx, y + 38, rw, 9, 4.5).fill('#E4DED8');
  if (pct > 0) doc.roundedRect(rx, y + 38, Math.max(9, (rw * Math.min(pct, 100)) / 100), 9, 4.5).fill(colCat);
  doc.font('Helvetica').fontSize(9).fillColor(C.texto)
    .text(`${bajoUmbral} preguntas bajo ${UMBRAL_PLAN_ACCION}   ·   ${cantCompromisos} compromisos`, rx, y + 56, { lineBreak: false });
  y += 78 + 20;

  // ── Tabla de resultado por pregunta ─────────────────────────
  doc.x = M;
  doc.y = y;
  tituloSeccion('Resultado por pregunta');

  const cols = [
    { k: 'n', t: 'N°', w: 30 },
    { k: 'a', t: 'Ámbito', w: 150 },
    { k: 'c', t: 'Criterio evaluado', w: ancho - 30 - 150 - 60 },
    { k: 'p', t: 'Puntaje', w: 60, align: 'right' },
  ];
  const pad = 5;

  const dibujarCabeceraTabla = () => {
    let x = M;
    const yy = doc.y;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.tinta);
    cols.forEach((c) => {
      doc.text(c.t, x + pad, yy, { width: c.w - pad * 2, align: c.align || 'left', lineBreak: false });
      x += c.w;
    });
    doc.moveTo(M, yy + 14).lineTo(M + ancho, yy + 14).lineWidth(1.2).strokeColor(C.tinta).stroke();
    doc.y = yy + 18;
  };
  dibujarCabeceraTabla();

  const preguntasOrdenadas = [...(m.preguntas || [])].sort((a, b) => a.numero - b.numero);
  preguntasOrdenadas.forEach((p) => {
    const def = preguntaPorNumero(p.numero) || {};
    const valores = {
      n: String(p.numero).padStart(2, '0'),
      a: def.ambito || '',
      c: def.resumen || '',
      p: p.puntaje === null || p.puntaje === undefined ? '—' : `${p.puntaje}/${PUNTAJE_MAX_PREGUNTA}`,
    };
    const comentario = (p.comentario || '').trim();

    doc.font('Helvetica-Bold').fontSize(9);
    const hA = doc.heightOfString(valores.a, { width: cols[1].w - pad * 2 });
    doc.font('Helvetica').fontSize(9);
    let hC = doc.heightOfString(valores.c, { width: cols[2].w - pad * 2 });
    let hCom = 0;
    if (comentario) {
      doc.font('Helvetica-Oblique').fontSize(8);
      hCom = doc.heightOfString(comentario, { width: cols[2].w - pad * 2 }) + 3;
    }
    const altoFila = Math.max(hA, hC + hCom) + pad * 2;

    if (doc.y + altoFila > limiteInferior()) {
      doc.addPage();
      dibujarCabeceraTabla();
    }
    const fy = doc.y;
    const bajo = p.puntaje !== null && p.puntaje !== undefined && p.puntaje < UMBRAL_PLAN_ACCION;
    if (bajo) doc.rect(M, fy, ancho, altoFila).fill(C.fondoNaranja);

    let x = M;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.tinta)
      .text(valores.n, x + pad, fy + pad, { width: cols[0].w - pad * 2 });
    x += cols[0].w;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(C.tinta)
      .text(valores.a, x + pad, fy + pad, { width: cols[1].w - pad * 2 });
    x += cols[1].w;
    doc.font('Helvetica').fontSize(9).fillColor(C.texto)
      .text(valores.c, x + pad, fy + pad, { width: cols[2].w - pad * 2 });
    if (comentario) {
      doc.font('Helvetica-Oblique').fontSize(8).fillColor(C.gris)
        .text(comentario, x + pad, fy + pad + hC + 3, { width: cols[2].w - pad * 2 });
    }
    x += cols[2].w;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(colorPuntaje(p.puntaje))
      .text(valores.p, x + pad, fy + pad, { width: cols[3].w - pad * 2, align: 'right' });

    doc.moveTo(M, fy + altoFila).lineTo(M + ancho, fy + altoFila).lineWidth(0.8).strokeColor(C.borde).stroke();
    doc.x = M;
    doc.y = fy + altoFila;
  });

  // Fila total
  asegurarEspacio(26);
  const ty = doc.y;
  doc.moveTo(M, ty).lineTo(M + ancho, ty).lineWidth(1.2).strokeColor(C.tinta).stroke();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(C.tinta)
    .text('Total', M + cols[0].w + pad, ty + 7, { lineBreak: false });
  doc.text(`${m.puntajeTotal || 0} / ${PUNTAJE_MAX_TOTAL}`, M + ancho - cols[3].w, ty + 7,
    { width: cols[3].w - pad, align: 'right', lineBreak: false });
  doc.x = M;
  doc.y = ty + 28;

  // ── Plan de acción ──────────────────────────────────────────
  doc.addPage();
  tituloSeccion(
    'Plan de acción',
    `Una ficha por cada pregunta con puntaje menor a ${UMBRAL_PLAN_ACCION}. El cumplimiento se verifica con la evidencia indicada.`
  );

  const compromisos = [...(m.compromisos || [])].sort((a, b) => a.preguntaNumero - b.preguntaNumero);
  if (!compromisos.length) {
    doc.font('Helvetica').fontSize(11).fillColor(C.texto)
      .text(`Todas las preguntas obtuvieron ${UMBRAL_PLAN_ACCION} o más. No se generaron compromisos.`, M, doc.y, { width: ancho });
    doc.moveDown(1);
  }

  const labelW = 130;
  const valorW = ancho - labelW;
  compromisos.forEach((c) => {
    const filas = [
      ['Deficiencia detectada', c.deficiencia],
      ['Acción del mentor', c.accionMentor],
      ['Compromiso del alumno', c.compromisoAlumno],
      ['Responsable · fecha', `${c.responsable || '—'} · ${fmtFecha(c.fechaCompromiso)}`],
      ['Evidencia', c.evidenciaRequerida],
      ['Estado', ESTADO_TXT[c.estado] || c.estado || '—'],
    ].map(([l, v]) => {
      const txt = (v || '').toString().trim() || '—';
      doc.font('Helvetica').fontSize(9);
      const h = Math.max(doc.heightOfString(txt, { width: valorW - 20 }), 11) + 12;
      return { l, txt, h };
    });

    const altoCab = 26;
    const altoTotal = altoCab + filas.reduce((s, f) => s + f.h, 0);
    // Si la ficha cabe en una página, no la partimos.
    if (altoTotal < limiteInferior() - (M + 30)) asegurarEspacio(altoTotal + 4);
    else asegurarEspacio(altoCab + filas[0].h);

    let fy = doc.y;
    doc.rect(M, fy, ancho, altoCab).fill(C.fondoNaranja);
    doc.rect(M, fy, ancho, altoCab).lineWidth(1).strokeColor(C.borde).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.tinta)
      .text(`${String(c.preguntaNumero).padStart(2, '0')} · ${c.ambito || ''}`, M + 10, fy + 8,
        { width: ancho - 140, lineBreak: false, ellipsis: true });
    const badge = `BAJO ${UMBRAL_PLAN_ACCION}`;
    doc.font('Helvetica-Bold').fontSize(8);
    const bw = doc.widthOfString(badge) + 14;
    doc.roundedRect(M + ancho - bw - 10, fy + 6, bw, 14, 7).fill(C.naranja);
    doc.fillColor('#FFFFFF').text(badge, M + ancho - bw - 10, fy + 9.5, { width: bw, align: 'center', lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.tinta)
      .text(`${c.puntaje ?? '—'}/${PUNTAJE_MAX_PREGUNTA}`, M + ancho - bw - 70, fy + 8, { width: 52, align: 'right', lineBreak: false });
    fy += altoCab;

    filas.forEach((f) => {
      if (fy + f.h > limiteInferior()) {
        doc.addPage();
        fy = doc.y;
      }
      doc.rect(M, fy, ancho, f.h).lineWidth(0.8).strokeColor(C.borde).stroke();
      doc.font('Helvetica-Bold').fontSize(9).fillColor(C.texto).text(f.l, M + 10, fy + 6, { width: labelW - 16 });
      doc.font('Helvetica').fontSize(9).fillColor(C.tinta).text(f.txt, M + labelW + 10, fy + 6, { width: valorW - 20 });
      fy += f.h;
    });
    doc.x = M;
    doc.y = fy + 14;
  });

  // ── Observaciones ───────────────────────────────────────────
  doc.addPage();
  tituloSeccion('Observaciones');
  const obs = m.observaciones || {};
  const bloques = [
    ...(ocultarObservacionesSinFiltro
      ? []
      : [
          ['Sin filtro · SAC', obs.sac, C.rojo],
          ['Sin filtro · Cocina', obs.cocina, C.naranja],
          ['Sin filtro · Liderazgo', obs.liderazgo, C.azul],
        ]),
    ['Finanzas', obs.finanzas, C.texto],
  ];
  bloques.forEach(([titulo, texto, color]) => {
    const txt = (texto || '').trim() || 'Sin observaciones.';
    doc.font('Helvetica').fontSize(10);
    const hTxt = doc.heightOfString(txt, { width: ancho - 32 });
    const alto = Math.max(hTxt + 40, 64);
    asegurarEspacio(alto + 10);
    const by = doc.y;
    doc.roundedRect(M, by, ancho, alto, 6).lineWidth(1).strokeColor(C.borde).stroke();
    doc.roundedRect(M + 16, by + 15, 7, 7, 1.5).fill(color);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.tinta).text(titulo, M + 30, by + 13, { lineBreak: false });
    doc.font('Helvetica').fontSize(10).fillColor(C.tinta).text(txt, M + 16, by + 32, { width: ancho - 32 });
    doc.x = M;
    doc.y = by + alto + 10;
  });

  // ── Firmas ──────────────────────────────────────────────────
  const altoFirmas = 90;
  asegurarEspacio(altoFirmas + 20);
  const fyFirma = Math.max(doc.y + 20, limiteInferior() - altoFirmas);
  const fw = (ancho - 48) / 2;
  [[m.mentorNombre, 'Mentor'], [m.alumnoNombre, 'Alumno · Administrador del local']].forEach(([nombre, rol], i) => {
    const fx = M + i * (fw + 48);
    doc.moveTo(fx, fyFirma + 46).lineTo(fx + fw, fyFirma + 46).lineWidth(1.2).strokeColor(C.tinta).stroke();
    doc.font('Helvetica-Bold').fontSize(10).fillColor(C.tinta).text(nombre || '—', fx, fyFirma + 54, { width: fw, lineBreak: false });
    doc.font('Helvetica').fontSize(8).fillColor(C.gris).text(rol, fx, fyFirma + 68, { width: fw, lineBreak: false });
  });

  // ── Pie de página en todas las páginas ──────────────────────
  doc.removeListener('pageAdded', encabezadoContinuo);
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i++) {
    doc.switchToPage(i);
    const margenOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const py = H - M + 6;
    doc.font('Helvetica').fontSize(8).fillColor(C.gris)
      .text(`KamiSushi · Informe de Mentoría · ${m.localNombre || ''}`, M, py, { width: ancho / 2, lineBreak: false });
    doc.text(`Página ${i + 1} de ${rango.count}`, M + ancho / 2, py, { width: ancho / 2, align: 'right', lineBreak: false });
    doc.page.margins.bottom = margenOriginal;
  }

  doc.end();
  return doc;
}

module.exports = { generarPdfMentoria };
