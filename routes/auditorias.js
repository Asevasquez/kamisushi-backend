const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Auditoria = require('../models/Auditoria');
const Revision = require('../models/Revision');
const { verifyToken } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');

// Solo estos 3 roles pueden ver/usar el módulo de Auditoría, tanto desde la
// app como desde el dashboard.
const ROLES_PERMITIDOS = ['auditor', 'gerencia', 'master'];

function soloRolesPermitidos(req, res, next) {
  if (!ROLES_PERMITIDOS.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tienes acceso al módulo de Auditoría' });
  }
  next();
}
router.use(verifyToken, soloRolesPermitidos);

// ────────────────────────────────────────────────────────────
// Cálculo de puntajes — mismas categorías que Revision
// ────────────────────────────────────────────────────────────
function obtenerCategoria(pct) {
  if (pct >= 100) return 'EXCELENTE';
  if (pct >= 95) return 'MUY BUENO';
  if (pct >= 80) return 'BUENO';
  if (pct >= 70) return 'REGULAR';
  if (pct >= 60) return 'MALO';
  return 'PÉSIMO';
}

// ────────────────────────────────────────────────────────────
// Generación de PDF — reutiliza el mismo mecanismo que
// backend/routes/revisiones.js para fotos y cajas de observación
// (duplicado acá en vez de importado, para no arriesgar el archivo de
// revisiones que ya está funcionando en producción).
// ────────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

const TEXTO_PREGUNTA = {
  'SC-A1': '¿Supervisa que los pedidos salgan completos, correctamente agendados y validados antes de ser entregados al cliente?',
  'SC-A2': '¿Gestiona y da solución oportuna a los reclamos, evitando clientes sin respuesta o casos sin seguimiento?',
  'SC-A3': '¿Aplican los protocolos de atención enfocados a subir el ticket promedio y mejorar la experiencia de nuestros clientes?',
  'COC-A1': '¿Pueden identificar una preparación que no cumple el estándar de calidad?',
  'COC-A2': '¿Cumple con la preparación del día (mise en place)?',
  'COC-A3': '¿Supervisan correctamente la conservación, rotulación, temperaturas, descongelación y manipulación de los alimentos?',
};

function getColorCategoria(categoria) {
  const colores = {
    'EXCELENTE': '#4caf50', 'MUY BUENO': '#8bc34a', 'BUENO': '#2196f3',
    'REGULAR': '#ff9800', 'MALO': '#f44336', 'PÉSIMO': '#d32f2f',
  };
  return colores[categoria] || '#666666';
}

function getColorNota(nota) {
  // nota de 0 a 10 — mismo criterio de color que las notas en la app
  if (nota >= 8) return '#2e7d32';
  if (nota >= 7) return '#f57c00';
  if (nota >= 6) return '#ef6c00';
  return '#c62828';
}

function formatDate(dateString) {
  if (!dateString) return 'Fecha no disponible';
  try { return new Date(dateString).toLocaleDateString('es-CL'); } catch (e) { return 'Fecha inválida'; }
}

function resolverImagenParaPDF(fotoRef) {
  if (!fotoRef || typeof fotoRef !== 'string') return null;
  try {
    if (fotoRef.startsWith('data:image')) {
      const matches = fotoRef.match(/^data:image\/\w+;base64,(.+)$/);
      return matches ? Buffer.from(matches[1], 'base64') : null;
    }
    if (fotoRef.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(fotoRef));
      return fs.existsSync(filePath) ? filePath : null;
    }
  } catch (e) { return null; }
  return null;
}

function dibujarTarjetasInfo(doc, items) {
  const colW = 245, gap = 5, y = doc.y;
  items.forEach((item, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const x = 50 + col * (colW + gap);
    const yy = y + row * 40;
    doc.roundedRect(x, yy, colW, 34, 4).fill('#f7f7f7');
    doc.fontSize(7.5).fillColor('#888888').text(item.label, x + 10, yy + 6);
    doc.fontSize(10.5).fillColor('#222222').text(String(item.value), x + 10, yy + 17, { width: colW - 20 });
  });
  doc.y = y + Math.ceil(items.length / 2) * 40;
}

function dibujarTarjetasKPIAuditoria(doc, kpis) {
  const colW = 158, gap = 10, y = doc.y, h = 62;
  kpis.forEach((k, i) => {
    const x = 50 + i * (colW + gap);
    doc.roundedRect(x, y, colW, h, 5).fill(k.color);
    doc.fontSize(8).fillColor('#ffffff').fillOpacity(0.9).text(k.nombre.toUpperCase(), x + 10, y + 9, { width: colW - 20 });
    doc.fillOpacity(1);
    doc.fontSize(15).fillColor('#ffffff').text(k.valor, x + 10, y + 22, { width: colW - 20 });
    doc.fontSize(7.5).fillColor('#ffffff').fillOpacity(0.85).text(k.sub || '', x + 10, y + 44, { width: colW - 20 });
    doc.fillOpacity(1);
  });
  doc.y = y + h + 8;
}

// Fila de preguntas con su nota (0-10), con una franja de color a la
// izquierda según qué tan buena fue la nota — igual que en el mockup.
function dibujarPregunta(doc, texto, nota) {
  const alturaTexto = doc.heightOfString(texto, { width: 430, fontSize: 9.5 });
  const alturaCaja = Math.max(26, 16 + alturaTexto);
  const espacioDisponible = doc.page.height - doc.page.margins.bottom - doc.y;
  if (alturaCaja + 6 > espacioDisponible) doc.addPage();

  const yStart = doc.y;
  const color = getColorNota(nota);
  doc.rect(50, yStart, 4, alturaCaja).fill(color);
  doc.roundedRect(54, yStart, 441, alturaCaja, 2).fill('#f9f9f9');
  doc.fontSize(9.5).fillColor('#333333').text(texto, 64, yStart + 8, { width: 380 });
  doc.fontSize(13).fillColor(color).text(`${nota}/10`, 454, yStart + (alturaCaja / 2) - 7, { width: 35, align: 'right' });
  doc.y = yStart + alturaCaja + 6;
}

function dibujarCajaObservacionAuditoria(doc, label, texto, colorFondo, colorBorde, colorLabel) {
  const tieneTexto = texto && texto.trim() !== '';
  const contenido = tieneTexto ? texto.trim() : 'Sin observaciones';
  const alturaTexto = doc.heightOfString(contenido, { width: 470, fontSize: 9.5 });
  const alturaCaja = 28 + alturaTexto;

  const espacioDisponible = doc.page.height - doc.page.margins.bottom - doc.y;
  if (alturaCaja > espacioDisponible) doc.addPage();

  const yStart = doc.y;
  doc.roundedRect(50, yStart, 495, alturaCaja, 4).fillAndStroke(colorFondo, colorBorde);
  doc.fontSize(8).fillColor(colorLabel).text(label.toUpperCase(), 60, yStart + 8);
  doc.fontSize(9.5).fillColor(tieneTexto ? '#333333' : '#999999');
  if (!tieneTexto) doc.font('Helvetica-Oblique');
  doc.text(contenido, 60, yStart + 19, { width: 470 });
  doc.font('Helvetica');
  doc.y = yStart + alturaCaja + 8;
}

async function generarPDFAuditoria(res, auditoria) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const nombreLocal = (auditoria.localNombre || 'Local').replace(/[^\w\-]+/g, '_');
    const fechaStr = formatDate(auditoria.fechaAuditoria).replace(/\//g, '-');
    const idCorto = auditoria._id.toString().slice(-8);
    const filename = `Auditoria_${nombreLocal}_${fechaStr}_${idCorto}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    doc.pipe(res);
    doc.font('Helvetica');

    const colorCat = getColorCategoria(auditoria.categoria);

    // ── Encabezado ──
    doc.fontSize(18).fillColor('#f20000').text('KamiSushi — Informe de Auditoría', 50, 50);
    doc.fontSize(10).fillColor('#888888')
      .text(`${auditoria.localNombre} — Auditoría del ${formatDate(auditoria.fechaAuditoria)}`, 50, 72);
    doc.y = 100;

    // ── Hero puntaje ──
    doc.roundedRect(50, doc.y, 495, 90, 8).fill(colorCat);
    const heroY = doc.y;
    doc.fontSize(38).fillColor('#ffffff').text(`${auditoria.puntajeTotal}%`, 50, heroY + 16, { width: 495, align: 'center' });
    doc.fontSize(14).fillColor('#ffffff').text(auditoria.categoria, 50, heroY + 58, { width: 495, align: 'center' });
    doc.y = heroY + 100;

    // ── Info de contexto ──
    dibujarTarjetasInfo(doc, [
      { label: 'Local', value: auditoria.localNombre },
      { label: 'Supervisora (revisión)', value: auditoria.supervisorNombre || '—' },
      { label: 'Fecha revisión original', value: formatDate(auditoria.fechaRevision) },
      { label: '% Original', value: `${auditoria.porcentajeRevisionOriginal}% — ${auditoria.categoriaRevisionOriginal}` },
    ]);
    doc.y += 8;

    // ── KPIs ──
    dibujarTarjetasKPIAuditoria(doc, [
      { nombre: 'Auditor', valor: auditoria.auditorNombre, sub: formatDate(auditoria.fechaAuditoria), color: '#1976d2' },
      { nombre: 'Servicio al Cliente', valor: `${auditoria.puntajeServicioCliente}/30`, sub: `${auditoria.reclamos?.length || 0} reclamo(s) descontado(s)`, color: '#2e7d32' },
      { nombre: 'Cocina', valor: `${auditoria.puntajeCocina}/30`, sub: 'Sin descuentos', color: '#7c3aed' },
    ]);
    doc.y += 4;

    // ── Servicio al Cliente ──
    doc.fontSize(12).fillColor('#f20000').text('SERVICIO AL CLIENTE Y CAJA', 50, doc.y, { underline: true });
    doc.y += 16;
    (auditoria.servicioCliente?.preguntas || []).forEach(p => {
      dibujarPregunta(doc, TEXTO_PREGUNTA[p.id] || p.id, p.puntaje);
    });
    dibujarCajaObservacionAuditoria(doc, 'Observación SAC', auditoria.servicioCliente?.observacionSAC, '#fffbea', '#f0e0a0', '#a07800');

    // ── Cocina (hoja nueva) ──
    doc.addPage();
    doc.fontSize(12).fillColor('#f20000').text('COCINA', 50, doc.y, { underline: true });
    doc.y += 16;
    (auditoria.cocina?.preguntas || []).forEach(p => {
      dibujarPregunta(doc, TEXTO_PREGUNTA[p.id] || p.id, p.puntaje);
    });
    dibujarCajaObservacionAuditoria(doc, 'Observación Cocina', auditoria.cocina?.observacionCocina, '#fffbea', '#f0e0a0', '#a07800');
    dibujarCajaObservacionAuditoria(doc, 'Observación Supervisión', auditoria.cocina?.observacionSupervision, '#f0f6ff', '#b0cef0', '#1565c0');

    // ── Reclamos ──
    doc.y += 4;
    doc.fontSize(12).fillColor('#f20000').text(`RECLAMOS DE LA AUDITORÍA (${auditoria.reclamos?.length || 0})`, 50, doc.y, { underline: true });
    doc.y += 16;

    (auditoria.reclamos || []).forEach(r => {
      const tieneFoto = !!resolverImagenParaPDF(r.foto);
      const alturaBase = 60;
      const alturaCaja = alturaBase + (tieneFoto ? 90 : 0);
      const espacioDisponible = doc.page.height - doc.page.margins.bottom - doc.y;
      if (alturaCaja + 6 > espacioDisponible) doc.addPage();

      const yStart = doc.y;
      doc.roundedRect(50, yStart, 495, alturaCaja, 4).stroke('#eeeeee');
      doc.fontSize(10.5).fillColor('#c62828').text(r.tipo || 'Sin tipo', 60, yStart + 10);
      const solucionColor = (r.entregoSolucion && r.entregoSolucion !== 'NO') ? '#2e7d32' : '#c62828';
      doc.roundedRect(475, yStart + 8, 60, 16, 3).fill(solucionColor);
      doc.fontSize(7.5).fillColor('#ffffff').text(r.entregoSolucion || 'NO', 475, yStart + 12, { width: 60, align: 'center' });
      doc.fontSize(8.5).fillColor('#888888')
        .text(`Tel. ${r.telefono || '—'} · ${formatDate(r.fecha)}${r.montoCompensacion && r.montoCompensacion !== '0' ? ' · $' + r.montoCompensacion : ''}`, 60, yStart + 26);
      if (r.comentario) doc.fontSize(9).fillColor('#444444').text(r.comentario, 60, yStart + 40, { width: 420 });

      if (tieneFoto) {
        try {
          const img = resolverImagenParaPDF(r.foto);
          doc.rect(60, yStart + alturaBase, 80, 80).stroke('#dddddd');
          doc.image(img, 61, yStart + alturaBase + 1, { fit: [78, 78], align: 'center', valign: 'center' });
        } catch (e) { /* imagen corrupta, se omite */ }
      }
      doc.y = yStart + alturaCaja + 8;
    });

    // ── Pie de página — una sola línea al final, DENTRO del margen inferior
    // (page.height - 60, no -40): escribir fuera del margen hace que PDFKit
    // dispare páginas nuevas por su cuenta, que fue exactamente el bug que
    // ya habíamos encontrado y corregido en el PDF de revisiones.
    const footerY = doc.page.height - 60;
    doc.fontSize(8).fillColor('#aaaaaa').text(
      `KamiSushi Supervisión — Informe de Auditoría | Generado ${new Date().toLocaleString('es-CL')} | ${doc.bufferedPageRange().count} página(s)`,
      50, footerY, { align: 'center' }
    );

    doc.end();
    doc.on('end', resolve);
    doc.on('error', reject);
  });
}

function calcularPuntajes(data) {
  const sumaPreguntas = (preguntas) =>
    (preguntas || []).reduce((acc, p) => acc + (Number(p.puntaje) || 0), 0);

  const puntajeSCBruto = sumaPreguntas(data.servicioCliente?.preguntas);
  const cantidadReclamos = (data.reclamos || []).length;
  // La cantidad de reclamos se resta directo de los puntos de Servicio al
  // Cliente, con piso en 0 (no puede quedar negativo).
  const puntajeServicioCliente = Math.max(0, puntajeSCBruto - cantidadReclamos);
  const puntajeCocina = sumaPreguntas(data.cocina?.preguntas);

  // Cada sección vale 50% sobre un máximo de 30 puntos — el total posible
  // es 60 puntos, que se lleva a porcentaje.
  const puntajeTotal = ((puntajeServicioCliente + puntajeCocina) / 60) * 100;

  return {
    puntajeServicioCliente,
    puntajeCocina,
    puntajeTotal: Math.round(puntajeTotal * 10) / 10,
    categoria: obtenerCategoria(puntajeTotal),
  };
}

// ────────────────────────────────────────────────────────────
// GET /revisiones-disponibles — revisiones finalizadas que aún no tienen
// auditoría, para la pantalla de "elegir revisión" en la app.
// ────────────────────────────────────────────────────────────
router.get('/revisiones-disponibles', async (req, res) => {
  try {
    const { busqueda, page = 1, limit = 20 } = req.query;

    const yaAuditadas = await Auditoria.find({}).distinct('revisionId');

    const query = { esBorrador: false, _id: { $nin: yaAuditadas } };
    if (busqueda) {
      const locales = await mongoose.model('Local').find({
        nombre: { $regex: busqueda, $options: 'i' },
      }).distinct('_id');
      query.localId = { $in: locales };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Revision.find(query)
        .populate('localId', 'nombre ciudad')
        .sort({ fechaRevision: -1 })
        .skip(skip).limit(Number(limit))
        .select('localId fechaRevision supervisorNombre porcentajeTotal categoria'),
      Revision.countDocuments(query),
    ]);

    res.json({
      data: data.map(r => ({
        _id: r._id,
        localNombre: r.localId?.nombre || 'Sin local',
        localCiudad: r.localId?.ciudad || '',
        fechaRevision: r.fechaRevision,
        supervisorNombre: r.supervisorNombre,
        porcentajeTotal: r.porcentajeTotal,
        categoria: r.categoria,
      })),
      total,
    });
  } catch (error) {
    console.error('Error listando revisiones disponibles para auditar:', error);
    res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// GET / — listado de auditorías (dashboard), con filtros
// ────────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { mes, localId, auditorId, categoria, page = 1, limit = 20 } = req.query;
    const query = {};

    if (mes) {
      const [anio, m] = mes.split('-').map(Number);
      const inicio = new Date(anio, m - 1, 1);
      const fin = new Date(anio, m, 0, 23, 59, 59, 999);
      query.fechaAuditoria = { $gte: inicio, $lte: fin };
    }
    if (localId) query.localId = new mongoose.Types.ObjectId(localId);
    if (auditorId) query.auditorId = new mongoose.Types.ObjectId(auditorId);
    if (categoria) query.categoria = { $in: String(categoria).split(',') };

    const skip = (Number(page) - 1) * Number(limit);
    const [data, total] = await Promise.all([
      Auditoria.find(query).sort({ fechaAuditoria: -1 }).skip(skip).limit(Number(limit)),
      Auditoria.countDocuments(query),
    ]);

    res.json({ data, total });
  } catch (error) {
    console.error('Error listando auditorías:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /:id — detalle de una auditoría (dashboard, PDF)
router.get('/:id', async (req, res) => {
  try {
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });
    res.json(auditoria);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET /:id/pdf — informe descargable de la auditoría
router.get('/:id/pdf', async (req, res) => {
  try {
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });
    await generarPDFAuditoria(res, auditoria);
  } catch (error) {
    console.error('Error generando PDF de auditoría:', error);
    if (!res.headersSent) res.status(500).json({ error: error.message });
  }
});

// ────────────────────────────────────────────────────────────
// POST / — crear una auditoría nueva (borrador o directo finalizada)
// ────────────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const { revisionId } = req.body;

    if (!revisionId) return res.status(400).json({ error: 'Falta la revisión a auditar' });

    const yaExiste = await Auditoria.findOne({ revisionId });
    if (yaExiste) return res.status(400).json({ error: 'Esta revisión ya fue auditada' });

    const revision = await Revision.findById(revisionId).populate('localId', 'nombre');
    if (!revision) return res.status(404).json({ error: 'La revisión a auditar no existe' });
    if (revision.esBorrador) return res.status(400).json({ error: 'No se puede auditar una revisión que sigue como borrador' });

    const puntajes = calcularPuntajes(req.body);

    const auditoria = new Auditoria({
      revisionId,
      localId: revision.localId?._id || revision.localId,
      localNombre: revision.localId?.nombre || 'Sin local',
      fechaRevision: revision.fechaRevision,
      supervisorNombre: revision.supervisorNombre || '',
      porcentajeRevisionOriginal: revision.porcentajeTotal || 0,
      categoriaRevisionOriginal: revision.categoria || '',
      auditorId: req.user.id,
      auditorNombre: req.user.nombre,
      servicioCliente: req.body.servicioCliente || {},
      cocina: req.body.cocina || {},
      reclamos: req.body.reclamos || [],
      ...puntajes,
      esBorrador: req.body.esBorrador !== false, // por defecto queda como borrador salvo que se pida lo contrario
    });

    await auditoria.save();
    console.log('Auditoría creada:', auditoria._id.toString(), '| Local:', auditoria.localNombre, '| Auditor:', req.user.nombre);
    res.status(201).json(auditoria);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Esta revisión ya fue auditada' });
    }
    console.error('Error creando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id — actualizar una auditoría (mientras sigue como borrador)
router.put('/:id', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });

    if (req.body.servicioCliente) auditoria.servicioCliente = req.body.servicioCliente;
    if (req.body.cocina) auditoria.cocina = req.body.cocina;
    if (req.body.reclamos) auditoria.reclamos = req.body.reclamos;

    const puntajes = calcularPuntajes(auditoria.toObject());
    Object.assign(auditoria, puntajes);

    await auditoria.save();
    res.json(auditoria);
  } catch (error) {
    console.error('Error actualizando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /:id/finalizar
router.put('/:id/finalizar', async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body || {});
    const auditoria = await Auditoria.findById(req.params.id);
    if (!auditoria) return res.status(404).json({ error: 'Auditoría no encontrada' });

    if (req.body.servicioCliente) auditoria.servicioCliente = req.body.servicioCliente;
    if (req.body.cocina) auditoria.cocina = req.body.cocina;
    if (req.body.reclamos) auditoria.reclamos = req.body.reclamos;

    const puntajes = calcularPuntajes(auditoria.toObject());
    Object.assign(auditoria, puntajes);
    auditoria.esBorrador = false;

    await auditoria.save();
    console.log('Auditoría finalizada:', auditoria._id.toString());
    res.json(auditoria);
  } catch (error) {
    console.error('Error finalizando auditoría:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /:id — solo master, igual que en Revisiones
router.delete('/:id', async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede eliminar auditorías' });
  }
  try {
    await Auditoria.findByIdAndDelete(req.params.id);
    res.json({ message: 'Auditoría eliminada' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
