const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const { verifyToken, authorize } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');

// ==================== FUNCIONES AUXILIARES ====================

function getTextoPreguntaSC(id) {
  const textos = {
    'SC-01': 'El local cumple con la presentacion y estado fisico del local',
    'SC-02': 'Hay presencia del encargado en el local',
    'SC-03': 'Utilizan correctamente los discursos de persuasion de agua PCM',
    'SC-04': 'Cumple con el protocolo de atencion al cliente',
    'SC-05': 'Cumple con la persuasion de promociones LUX - Presencial',
    'SC-06': 'Cumple con la persuasion de promociones LUX - Llamadas',
    'SC-07': 'Cumple con la persuasion de promociones LUX - WhatsApp',
    'SC-08': 'Cuenta con publicidad fisica vigente y en buen estado',
    'SC-09': 'Se realiza el ofrecimiento de adicionales',
    'SC-10': 'Tiene las respuestas rapidas en WhatsApp Business',
    'SC-11': 'Tiene promociones vigentes y actualizadas',
    'SC-12': 'Sin listas de difusion masiva - WhatsApp',
    'SC-13': 'Tiene los contactos guardados correctamente',
    'SC-14': 'Existe conocimiento de carta por parte del equipo',
    'SC-15': 'Cuentan con los equipos operativos',
    'SC-16': 'Ruta de flyers realizada',
    'SC-17': 'Cumple con el protocolo de empaque',
  };
  return textos[id] || id;
}

function getTextoPreguntaCF(id) {
  const textos = {
    'CF-01': 'Realizan el lavado de arroz correctamente',
    'CF-02': 'Realizan el alino del arroz correctamente',
    'CF-03': 'Realizan la coccion del arroz correctamente',
    'CF-04': 'Mise en place en condiciones adecuadas',
    'CF-05': 'Cumple con los gramajes estandar',
    'CF-06': 'Se realiza la rotulacion de salsas',
    'CF-07': 'Plaquetas con gramaje adecuado',
    'CF-09': 'Realizan correctamente la dilucion de antioxidante',
    'CF-10': 'Lavado y almacenamiento de verduras correcto',
    'CF-11': 'Control de temperatura en refrigeracion',
    'CF-12': 'Descongelacion correcta de pollo y reineta',
    'CF-13': 'Ceviche correcto',
    'CF-14': 'Sellado de rollos correcto',
  };
  return textos[id] || id;
}

function getTextoPreguntaCC(id) {
  const textos = {
    'CC-01': 'Batido del huevo correcto',
    'CC-02': 'Proceso de apanado correcto',
    'CC-03': 'Control de temperatura de freidora',
    'CC-04': 'Sellado de puntas en rolls fritos',
    'CC-05': 'Control de grumos en harina, huevo y panko',
    'CC-06': 'Uso correcto de tablas de cortar',
    'CC-07': 'Estandarizacion de cortes del roll',
    'CC-08': 'Afilado y mantenimiento de cuchillos',
    'CC-09': 'Alinado del pollo correcto',
    'CC-10': 'Elaboracion correcta de recetas de salsas',
    'CC-11': 'Calidad y estado del aceite de fritura',
    'CC-12': 'Presentan dudas en elaboraciones',
    'CC-13': 'Campana extractora operativa y limpia',
    'CC-14': 'Limpieza diaria y profunda de areas',
    'CC-15': 'Limpieza y sanitizacion del area de trabajo',
    'CC-16': 'Utilizan elementos de proteccion e higiene',
  };
  return textos[id] || id;
}

function getColorPorcentaje(porcentaje) {
  if (porcentaje >= 90) return '#4caf50';
  if (porcentaje >= 80) return '#2196f3';
  if (porcentaje >= 70) return '#ff9800';
  if (porcentaje >= 60) return '#f44336';
  return '#d32f2f';
}

function getColorCategoria(categoria) {
  const colores = {
    'EXCELENTE': '#4caf50',
    'MUY BUENO': '#8bc34a',
    'BUENO': '#2196f3',
    'REGULAR': '#ff9800',
    'MALO': '#f44336',
    'PÉSIMO': '#d32f2f'
  };
  return colores[categoria] || '#666666';
}

function getCategoriaTexto(categoria) {
  const textos = {
    'EXCELENTE': 'Excelente',
    'MUY BUENO': 'Muy Bueno',
    'BUENO': 'Bueno',
    'REGULAR': 'Regular',
    'MALO': 'Malo',
    'PÉSIMO': 'Pésimo'
  };
  return textos[categoria] || categoria || 'Sin categoria';
}

function formatDate(dateString) {
  if (!dateString) return 'Fecha no disponible';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-CL');
  } catch (e) {
    return 'Fecha invalida';
  }
}

// ==================== GENERACIÓN DE PDF ====================

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Resuelve una referencia de foto (URL '/uploads/xxx.jpg' o, para datos antiguos,
// un data:image;base64) a algo que doc.image() de pdfkit pueda dibujar:
// una ruta de archivo en disco, o un Buffer. Devuelve null si no se puede usar
// (archivo faltante, formato inválido, etc.) para no romper el resto del PDF.
function resolverImagenParaPDF(fotoRef) {
  if (!fotoRef || typeof fotoRef !== 'string') return null;
  try {
    if (fotoRef.startsWith('data:image')) {
      const matches = fotoRef.match(/^data:image\/\w+;base64,(.+)$/);
      if (!matches) return null;
      return Buffer.from(matches[1], 'base64');
    }
    if (fotoRef.startsWith('/uploads/')) {
      const filePath = path.join(UPLOADS_DIR, path.basename(fotoRef));
      return fs.existsSync(filePath) ? filePath : null;
    }
  } catch (e) {
    return null;
  }
  return null;
}

// Dibuja hasta 4 miniaturas en fila a partir de x,y. Devuelve el alto ocupado
// (0 si no había fotos válidas) para que el caller haga moveDown según corresponda.
function dibujarFilaFotos(doc, fotos, x, y) {
  const validas = (fotos || []).map(resolverImagenParaPDF).filter(Boolean);
  if (validas.length === 0) return 0;

  const TAM = 55, GAP = 6, MAX = 4;
  const mostrar = validas.slice(0, MAX);
  mostrar.forEach((img, i) => {
    try {
      doc.rect(x + i * (TAM + GAP), y, TAM, TAM).stroke('#dddddd');
      doc.image(img, x + i * (TAM + GAP) + 1, y + 1, { fit: [TAM - 2, TAM - 2], align: 'center', valign: 'center' });
    } catch (e) {
      // Imagen corrupta o formato no soportado: se omite sin interrumpir el resto del PDF
    }
  });
  if (validas.length > MAX) {
    doc.fontSize(8).fillColor('#999999')
      .text(`+${validas.length - MAX} más`, x + MAX * (TAM + GAP), y + TAM / 2 - 4);
  }
  return TAM;
}

// Caja de observación general de una sección (o de "Derivación a Laury").
// Siempre se dibuja, incluso vacía, con un texto tipo "Sin observaciones".
function dibujarCajaObservacion(doc, label, texto, colores) {
  const tieneTexto = texto && texto.trim() !== '';
  const esLaury = label.toLowerCase().includes('laury');
  const contenido = tieneTexto ? texto.trim() : (esLaury ? 'Sin derivación' : 'Sin observaciones');

  const yStart = doc.y;
  const alturaTexto = doc.heightOfString(contenido, { width: 470, fontSize: 9.5 });
  const alturaCaja = 28 + alturaTexto;

  doc.roundedRect(50, yStart, 495, alturaCaja, 4).fillAndStroke(colores.fondo, colores.borde);
  doc.fontSize(8).fillColor(colores.label).text(label.toUpperCase(), 60, yStart + 8);
  doc.fontSize(9.5).fillColor(tieneTexto ? '#333333' : '#999999');
  if (!tieneTexto) doc.font('Helvetica-Oblique');
  doc.text(contenido, 60, yStart + 19, { width: 470 });
  doc.font('Helvetica');

  doc.y = yStart + alturaCaja + 8;
}

async function generarPDF(res, revision) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const nombreLocalRaw = (typeof revision.localId === 'object' ? revision.localId?.nombre : null) || 'Local';
    const nombreLocal = nombreLocalRaw.replace(/[^\w\-]+/g, '_');
    const fechaStr = revision.fechaRevision
      ? new Date(revision.fechaRevision).toLocaleDateString('es-CL').replace(/\//g, '-')
      : '';
    const idCorto = revision._id.toString().slice(-8);
    const filename = `Revision_${nombreLocal}_${fechaStr}_${idCorto}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);
    doc.font('Helvetica');

    // ============================================================
    // HOJA 1: RESUMEN GENERAL
    // ============================================================

    doc.fontSize(22).fillColor('#d32f2f').text('KAMI SUSHI', { align: 'center' });
    doc.fontSize(11).fillColor('#666666').text('Sistema de Supervision', { align: 'center' });
    doc.moveDown(0.5);
    doc.strokeColor('#d32f2f').lineWidth(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.7);

    doc.fontSize(16).fillColor('#333333').text('INFORME DE REVISION', { align: 'center' });
    doc.fontSize(10).fillColor('#888888')
      .text(`N°: REV-${idCorto.toUpperCase()} · ${nombreLocalRaw}`, { align: 'center' });
    doc.moveDown(1.2);

    // ========== CALIFICACION GLOBAL (tarjeta destacada) ==========
    const porcentaje = revision.porcentajeTotal || 0;
    const categoria = revision.categoria || 'Sin categoria';
    const categoriaTexto = getCategoriaTexto(categoria);
    const colorCategoria = getColorCategoria(categoria);

    const heroY = doc.y;
    doc.rect(50, heroY, 495, 70).fillAndStroke(hexConAlpha(colorCategoria, 0.08), colorCategoria);
    doc.fontSize(8).fillColor(colorCategoria).text('CALIFICACION GLOBAL', 68, heroY + 14);
    doc.fontSize(30).fillColor(colorCategoria).text(porcentaje + '%', 68, heroY + 26);
    doc.roundedRect(68, heroY + 54, 90, 14, 7).fill(colorCategoria);
    doc.fontSize(9).fillColor('#ffffff').text(categoriaTexto.toUpperCase(), 68, heroY + 57, { width: 90, align: 'center' });
    doc.y = heroY + 82;
    doc.moveDown(0.8);

    // ========== INFORMACION GENERAL (tarjetas) ==========
    const infoItems = [
      { label: 'LOCAL', value: nombreLocalRaw },
      { label: 'FECHA', value: formatDate(revision.fechaRevision) },
      { label: 'SUPERVISOR', value: revision.supervisorNombre || revision.supervisorId?.nombre || 'No especificado' },
      { label: 'TIPO', value: revision.esBorrador ? 'BORRADOR' : 'FINAL' },
    ];
    dibujarTarjetasInfo(doc, infoItems);
    doc.moveDown(1);

    // ========== KPIs POR SECCION (tarjetas lado a lado) ==========
    doc.fontSize(12).fillColor('#d32f2f').text('KPIS POR SECCION', 50, doc.y, { underline: true });
    doc.moveDown(0.6);

    const secciones = [
      { nombre: 'Servicio Cliente', peso: '40%', data: revision.servicioCliente },
      { nombre: 'Cuarto Frio', peso: '30%', data: revision.cuartoFrio },
      { nombre: 'Cuarto Caliente', peso: '30%', data: revision.cuartoCaliente },
    ];
    const kpiData = secciones.map(s => {
      const respuestas = s.data?.respuestas || {};
      const items = Object.keys(respuestas).length;
      const cumplidos = Object.values(respuestas).filter(v => v.cumple === true).length;
      const pct = items > 0 ? Math.round((cumplidos / items) * 100) : 0;
      return { ...s, pct, cumplidos, items };
    });
    dibujarTarjetasKPI(doc, kpiData);
    doc.moveDown(1);

    // ========== ADMINISTRADORES ==========
    doc.fontSize(12).fillColor('#d32f2f').text('ADMINISTRADORES', 50, doc.y, { underline: true });
    doc.moveDown(0.5);
    dibujarTarjetasAdmin(doc, [
      { nombre: 'Administrador: ' + (revision.administrador?.nombre || 'N/A'), presente: !!revision.administrador?.presente },
      { nombre: 'Sub / Encargado: ' + (revision.subAdministrador?.nombre || 'N/A'), presente: !!revision.subAdministrador?.presente },
    ]);
    doc.fontSize(9).fillColor('#666666')
      .text('Borran reclamos: ' + (revision.borranReclamos || 'No especificado'), 50, doc.y + 6);
    doc.moveDown(1.2);

    // ========== RECLAMOS (solo contador) ==========
    const reclamos = revision.servicioCliente?.reclamos || [];
    doc.fontSize(12).fillColor('#d32f2f').text('RECLAMOS', 50, doc.y, { underline: true });
    doc.moveDown(0.4);
    if (reclamos.length > 0) {
      const yStat = doc.y;
      doc.roundedRect(50, yStat, 495, 34, 5).fillAndStroke('#fff5f5', '#ffcdd2');
      doc.fontSize(16).fillColor('#d32f2f').text(String(reclamos.length), 65, yStat + 8);
      doc.fontSize(9).fillColor('#888888')
        .text('reclamo(s) registrado(s) — ver detalle en Hoja 2', 100, yStat + 13);
      doc.y = yStat + 44;
    } else {
      doc.fontSize(10).fillColor('#4caf50').text('No se registraron reclamos', 50, doc.y);
      doc.moveDown(0.8);
    }
    doc.moveDown(0.6);

    // ========== COMENTARIOS GENERALES ==========
    if (revision.comentariosGenerales && revision.comentariosGenerales.trim()) {
      doc.fontSize(12).fillColor('#d32f2f').text('COMENTARIOS GENERALES', 50, doc.y, { underline: true });
      doc.moveDown(0.4);
      const yBox = doc.y;
      const alturaTxt = doc.heightOfString(revision.comentariosGenerales.trim(), { width: 475, fontSize: 9.5 });
      doc.roundedRect(50, yBox, 495, alturaTxt + 20, 5).fill('#f7f7f7');
      doc.fontSize(9.5).fillColor('#444444').text(revision.comentariosGenerales.trim(), 60, yBox + 10, { width: 475 });
      doc.y = yBox + alturaTxt + 28;
    }

    const footerY1 = doc.page.height - 60;
    doc.fontSize(8).fillColor('#aaaaaa').text(
      'Generado por: ' + (revision.creadoPor || 'Sistema') + ' | ' + new Date().toLocaleString('es-CL') + ' | Pagina 1',
      50, footerY1, { align: 'center' }
    );

    // ============================================================
    // HOJA 2: DETALLE DE OBSERVACIONES Y RECLAMOS
    // ============================================================
    const seccionesDetalle = [
      {
        key: 'servicioCliente', titulo: 'SERVICIO AL CLIENTE', data: revision.servicioCliente,
        preguntas: getTextoPreguntaSC, obsGeneralCampo: 'observacionesPrincipales', tieneLaury: true,
      },
      {
        key: 'cuartoFrio', titulo: 'CUARTO FRIO', data: revision.cuartoFrio,
        preguntas: getTextoPreguntaCF, obsGeneralCampo: 'observacionesGenerales', tieneLaury: false,
      },
      {
        key: 'cuartoCaliente', titulo: 'CUARTO CALIENTE', data: revision.cuartoCaliente,
        preguntas: getTextoPreguntaCC, obsGeneralCampo: 'observacionesGenerales', tieneLaury: false,
      },
    ];

    const hayAlgoQueMostrar = seccionesDetalle.some(s =>
      (s.data?.[s.obsGeneralCampo] || '').trim() ||
      (s.tieneLaury && (s.data?.derivacionLaury || '').trim()) ||
      Object.values(s.data?.respuestas || {}).some(v => v.cumple === false)
    ) || reclamos.length > 0;

    if (hayAlgoQueMostrar) {
      doc.addPage();
      doc.fontSize(15).fillColor('#d32f2f').text('DETALLE DE OBSERVACIONES Y RECLAMOS', { align: 'center', underline: true });
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#888888')
        .text('Este informe detalla todas las observaciones, hallazgos y reclamos de la revision', { align: 'center' });
      doc.moveDown(1);

      for (const seccion of seccionesDetalle) {
        if (doc.y > 680) doc.addPage();

        doc.fontSize(12).fillColor('#2196f3').text(seccion.titulo, 50, doc.y, { underline: true });
        doc.moveDown(0.4);

        // Observación general (siempre se muestra, con fallback "Sin observaciones")
        dibujarCajaObservacion(doc, 'Observación general', seccion.data?.[seccion.obsGeneralCampo], {
          fondo: '#fff8e1', borde: '#ffca28', label: '#a17a00',
        });

        // Derivación a Laury (solo Servicio al Cliente)
        if (seccion.tieneLaury) {
          dibujarCajaObservacion(doc, 'Derivación a Laury', seccion.data?.derivacionLaury, {
            fondo: '#ede7f6', borde: '#9575cd', label: '#5e35b1',
          });
        }

        // Preguntas incumplidas con observación y/o fotos
        const items = Object.entries(seccion.data?.respuestas || {})
          .filter(([_, v]) => v.cumple === false);

        if (items.length > 0) {
          for (const [id, respuesta] of items) {
            const fotos = (respuesta.fotos || []).filter(f => f);
            const tieneObs = respuesta.observacion && respuesta.observacion.trim();
            const textoPregunta = seccion.preguntas(id);

            const alturaObs = tieneObs ? doc.heightOfString('Observación: ' + respuesta.observacion, { width: 480, fontSize: 8 }) : 0;
            const alturaFotos = fotos.length > 0 ? 63 : 0;
            const alturaCard = 34 + alturaObs + alturaFotos;

            if (doc.y + alturaCard > 760) {
              doc.addPage();
              doc.fontSize(12).fillColor('#2196f3').text(seccion.titulo + ' (continuacion)', 50, doc.y, { underline: true });
              doc.moveDown(0.4);
            }

            const yStart = doc.y;
            doc.rect(45, yStart, 500, alturaCard).stroke('#dddddd');
            doc.fontSize(9).fillColor('#d32f2f').text(id + ':', 55, yStart + 6);
            doc.fontSize(8).fillColor('#333333').text(textoPregunta, 55, yStart + 18, { width: 480 });

            let yCursor = yStart + 32;
            if (tieneObs) {
              doc.fontSize(8).fillColor('#666666')
                .text('Observación: ' + respuesta.observacion.trim(), 55, yCursor, { width: 480 });
              yCursor += alturaObs + 6;
            }
            if (fotos.length > 0) {
              dibujarFilaFotos(doc, fotos, 55, yCursor);
            }

            doc.y = yStart + alturaCard + 8;
          }
        } else {
          doc.fontSize(9).fillColor('#4caf50').text(seccion.titulo.charAt(0) + seccion.titulo.slice(1).toLowerCase() + ' - Sin preguntas incumplidas', 50, doc.y);
          doc.moveDown(0.8);
        }
        doc.moveDown(0.6);
      }

      // ===== DETALLE DE RECLAMOS =====
      if (reclamos.length > 0) {
        if (doc.y > 620) doc.addPage();

        doc.fontSize(12).fillColor('#d32f2f').text('DETALLE DE RECLAMOS', 50, doc.y, { underline: true });
        doc.moveDown(0.3);
        doc.fontSize(9).fillColor('#888888').text('Total: ' + reclamos.length + ' reclamo(s) registrado(s)', 50, doc.y);
        doc.moveDown(0.5);

        for (let i = 0; i < reclamos.length; i++) {
          const reclamo = reclamos[i];
          const tieneComentario = reclamo.comentario && reclamo.comentario.trim();
          const fotoReclamo = resolverImagenParaPDF(reclamo.foto);
          const alturaComentario = tieneComentario ? doc.heightOfString('Comentario: ' + reclamo.comentario, { width: 480, fontSize: 8 }) : 0;
          const alturaFotoReclamo = fotoReclamo ? 63 : 0;
          const alturaCard = 44 + alturaComentario + alturaFotoReclamo;

          if (doc.y + alturaCard > 760) {
            doc.addPage();
            doc.fontSize(12).fillColor('#d32f2f').text('DETALLE DE RECLAMOS (continuacion)', 50, doc.y, { underline: true });
            doc.moveDown(0.5);
          }

          const yStart = doc.y;
          doc.rect(45, yStart, 500, alturaCard).fill('#fff5f5').stroke('#d32f2f');

          doc.fontSize(9).fillColor('#d32f2f')
            .text('Reclamo #' + (i + 1) + ': ' + (reclamo.tipo || 'Sin tipo'), 55, yStart + 8, { width: 380, continued: false });
          doc.fontSize(8).fillColor('#888888')
            .text(reclamo.fecha ? new Date(reclamo.fecha).toLocaleDateString('es-CL') : '', 460, yStart + 9, { width: 80, align: 'right' });

          doc.fontSize(8).fillColor('#333333');
          let yOffset = 24;
          if (reclamo.telefono) {
            doc.fillColor('#333333').text('Telefono: ' + reclamo.telefono, 55, yStart + yOffset);
            yOffset += 12;
          }
          if (reclamo.entregoSolucion) {
            const colorSolucion = reclamo.entregoSolucion === 'Sí' || reclamo.entregoSolucion === 'Si' ? '#4caf50' : '#d32f2f';
            doc.fillColor(colorSolucion).text('Solucion: ' + reclamo.entregoSolucion, 55, yStart + yOffset);
            yOffset += 12;
          }
          if (reclamo.montoCompensacion && reclamo.montoCompensacion !== '0') {
            doc.fillColor('#333333').text('Monto compensacion: $' + reclamo.montoCompensacion, 55, yStart + yOffset);
            yOffset += 12;
          }
          if (tieneComentario) {
            doc.fillColor('#666666').text('Comentario: ' + reclamo.comentario.trim(), 55, yStart + yOffset, { width: 480 });
            yOffset += alturaComentario + 4;
          }
          if (fotoReclamo) {
            dibujarFilaFotos(doc, [reclamo.foto], 55, yStart + yOffset);
          }

          doc.y = yStart + alturaCard + 10;
        }
      }

      // ===== RESUMEN ESTADISTICO =====
      if (doc.y > 550) doc.addPage();

      doc.fontSize(14).fillColor('#d32f2f').text('RESUMEN DE OBSERVACIONES', { align: 'center', underline: true });
      doc.moveDown(1);

      const conteos = seccionesDetalle.map(s => ({
        seccion: s.titulo === 'SERVICIO AL CLIENTE' ? 'Servicio al Cliente' : (s.titulo === 'CUARTO FRIO' ? 'Cuarto Frio' : 'Cuarto Caliente'),
        cantidad: Object.values(s.data?.respuestas || {}).filter(v => v.cumple === false).length,
      }));
      const totalObservaciones = conteos.reduce((a, c) => a + c.cantidad, 0);
      const tableData = [...conteos, { seccion: 'Reclamos', cantidad: reclamos.length }, { seccion: 'TOTAL', cantidad: totalObservaciones + reclamos.length }];

      let yTabla = doc.y;
      doc.rect(50, yTabla, 400, 20).fill('#d32f2f');
      doc.rect(450, yTabla, 80, 20).fill('#d32f2f');
      doc.fontSize(10).fillColor('#ffffff');
      doc.text('SECCION', 60, yTabla + 4);
      doc.text('CANTIDAD', 460, yTabla + 4);
      yTabla += 20;

      const colores = ['#2196f3', '#4caf50', '#ff9800', '#d32f2f', '#333333'];
      for (let i = 0; i < tableData.length; i++) {
        const row = tableData[i];
        const esTotal = i === tableData.length - 1;
        doc.rect(50, yTabla, 400, 20).fill(esTotal ? '#f0f0f0' : '#fafafa');
        doc.rect(450, yTabla, 80, 20).fill(esTotal ? '#f0f0f0' : '#fafafa');
        doc.fillColor('#333333').fontSize(esTotal ? 10 : 9).text(row.seccion, 60, yTabla + 4);
        doc.fillColor(esTotal ? '#333333' : colores[i]).text(row.cantidad.toString(), 470, yTabla + 4);
        yTabla += 20;
      }
      doc.y = yTabla + 10;
      doc.moveDown(1);

      const totalProblemas = totalObservaciones + reclamos.length;
      let conclusion = '';
      if (totalProblemas === 0) {
        conclusion = 'Excelente desempeno. No se registraron observaciones ni reclamos. Mantener el nivel de calidad.';
      } else if (totalProblemas <= 5) {
        conclusion = 'Desempeno aceptable. Se recomienda abordar las observaciones detectadas en el proximo periodo.';
      } else if (totalProblemas <= 10) {
        conclusion = 'Desempeno regular. Es necesario implementar acciones correctivas. Se sugiere una reunion de seguimiento en 15 dias.';
      } else {
        conclusion = 'Desempeno critico. Se requiere intervencion inmediata y un plan de mejora estructurado.';
      }
      doc.fontSize(11).fillColor('#333333').text('CONCLUSION:', 50, doc.y);
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666666').text(conclusion, { width: 500, align: 'left' });

      const footerY2 = doc.page.height - 60;
      doc.fontSize(8).fillColor('#aaaaaa').text(
        'Generado por: ' + (revision.creadoPor || 'Sistema') + ' | ' + new Date().toLocaleString('es-CL') + ' | Pagina ' + doc.bufferedPageRange().count,
        50, footerY2, { align: 'center' }
      );
    }

    doc.end();
    res.on('finish', resolve);
    doc.on('error', reject);
    res.on('error', reject);
  });
}

// ---- Helpers de layout de la Hoja 1 ----

function hexConAlpha(hex, alpha) {
  // pdfkit no soporta alpha en fillAndStroke con hex directo para el fondo claro deseado,
  // así que se mezcla el color con blanco para simular una versión "clara" del mismo tono.
  const c = hex.replace('#', '');
  const r = parseInt(c.substring(0, 2), 16), g = parseInt(c.substring(2, 4), 16), b = parseInt(c.substring(4, 6), 16);
  const mix = (ch) => Math.round(ch + (255 - ch) * (1 - alpha));
  return '#' + [mix(r), mix(g), mix(b)].map(v => v.toString(16).padStart(2, '0')).join('');
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

function dibujarTarjetasKPI(doc, kpis) {
  const colW = 158, gap = 10, y = doc.y, h = 62;
  kpis.forEach((k, i) => {
    const x = 50 + i * (colW + gap);
    const sinDatos = k.items === 0;
    const color = sinDatos ? '#999999' : getColorPorcentaje(k.pct);
    doc.rect(x, y, colW, h).stroke('#eeeeee');
    doc.fontSize(8).fillColor('#666666').text(k.nombre.toUpperCase(), x + 8, y + 8, { width: colW - 16 });
    doc.fontSize(7).fillColor('#aaaaaa').text('peso ' + k.peso, x + 8, y + 18);
    doc.fontSize(17).fillColor(color).text(sinDatos ? '—' : k.pct + '%', x + 8, y + 26);
    const barW = colW - 16;
    doc.rect(x + 8, y + 48, barW, 5).fill('#eeeeee');
    if (!sinDatos) doc.rect(x + 8, y + 48, Math.max((k.pct / 100) * barW, 2), 5).fill(color);
    doc.fontSize(7).fillColor('#999999').text(sinDatos ? 'Sin datos' : `${k.cumplidos}/${k.items}`, x + 8, y + 55);
  });
  doc.y = y + h;
}

function dibujarTarjetasAdmin(doc, admins) {
  const colW = 245, gap = 5, y = doc.y, h = 24;
  admins.forEach((a, i) => {
    const x = 50 + i * (colW + gap);
    doc.rect(x, y, colW, h).stroke('#eeeeee');
    doc.fontSize(8.5).fillColor('#333333').text(a.nombre, x + 8, y + 7, { width: colW - 70 });
    doc.fontSize(8).fillColor(a.presente ? '#2e7d32' : '#d32f2f')
      .text(a.presente ? 'Presente' : 'Ausente', x + colW - 60, y + 7, { width: 55, align: 'right' });
  });
  doc.y = y + h;
}


// ============================================================
// ENDPOINTS
// ============================================================

router.get('/estadisticas-por-local', verifyToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.rol === 'supervisor') {
      // Tolerar tanto string como ObjectId para compatibilidad con revisiones antiguas
      try {
        query.$or = [
          { supervisorId: req.user.id },
          { supervisorId: new mongoose.Types.ObjectId(req.user.id) }
        ];
      } catch(e) {
        query.supervisorId = req.user.id;
      }
    }

    if (req.user.rol === 'administrador') {
      const localesAsignados = req.user.localesAsignados?.map(l => l._id?.toString() || l) || [];
      if (localesAsignados.length > 0) {
        const localIds = localesAsignados.flatMap(id => {
          try { return [id, new mongoose.Types.ObjectId(id)]; } catch(e) { return [id]; }
        });
        query.localId = { $in: localIds };
      } else {
        return res.json({});
      }
    }

    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

    query.fechaRevision = { $gte: inicioMes, $lte: finMes };

    const revisiones = await Revision.find(query).populate('localId', 'nombre ciudad');

    const estadisticasPorLocal = {};

    revisiones.forEach(rev => {
      const nombreLocal = rev.localId?.nombre || 'Local sin nombre';
      if (!estadisticasPorLocal[nombreLocal]) {
        estadisticasPorLocal[nombreLocal] = {
          revisiones: [],
          totalRevisiones: 0,
          promedioPorcentaje: 0,
          localId: rev.localId?._id
        };
      }

      estadisticasPorLocal[nombreLocal].revisiones.push({
        id: rev._id,
        fecha: rev.fechaRevision,
        porcentajeTotal: rev.porcentajeTotal || 0,
      });
      estadisticasPorLocal[nombreLocal].totalRevisiones++;
    });

    Object.keys(estadisticasPorLocal).forEach(local => {
      const data = estadisticasPorLocal[local];
      const suma = data.revisiones.reduce((acc, r) => acc + (r.porcentajeTotal || 0), 0);
      data.promedioPorcentaje = data.totalRevisiones > 0 ? suma / data.totalRevisiones : 0;
    });

    res.json(estadisticasPorLocal);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/', verifyToken, async (req, res) => {
  try {
    const { localId, supervisorId, fechaInicio, fechaFin, esBorrador, page = 1, limit = 10 } = req.query;
    let query = {};
    let localesPermitidos = null; // null = sin restricción (master/gerencia)

    if (req.user.rol === 'supervisor') {
      query.supervisorId = req.user.id;
    } else if (req.user.rol === 'administrador') {
      const asignados = (req.user.localesAsignados || []).map(l => (l._id || l).toString());
      if (asignados.length === 0) return res.json({ data: [], total: 0 });
      localesPermitidos = asignados;
    }

    // Filtro de local: valida contra los permisos del administrador antes de aplicarlo
    if (localId) {
      if (localesPermitidos && !localesPermitidos.includes(localId)) {
        return res.status(403).json({ error: 'No tienes acceso a este local' });
      }
      query.localId = new mongoose.Types.ObjectId(localId);
    } else if (localesPermitidos) {
      query.localId = { $in: localesPermitidos.map(id => new mongoose.Types.ObjectId(id)) };
    }

    // El supervisor no puede pedir revisiones de otro supervisor
    if (supervisorId && req.user.rol !== 'supervisor') {
      query.supervisorId = new mongoose.Types.ObjectId(supervisorId);
    }

    if (fechaInicio || fechaFin) {
      query.fechaRevision = {};
      if (fechaInicio) query.fechaRevision.$gte = new Date(fechaInicio);
      if (fechaFin) query.fechaRevision.$lte = new Date(fechaFin);
    }

    // Filtro explícito de borrador (ej. HomeScreen pide solo los pendientes de finalizar)
    if (esBorrador !== undefined) {
      query.esBorrador = esBorrador === 'true' || esBorrador === true;
    }

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100); // tope de seguridad

    // Proyección liviana para el LISTADO: sin respuestas ni reclamos (ahí van las fotos en base64).
    // El detalle completo (con fotos) se sigue pidiendo aparte via GET /:id cuando el usuario
    // selecciona una revisión puntual.
    const [revisiones, total] = await Promise.all([
      Revision.find(query)
        .select('fechaRevision localId supervisorId supervisorNombre porcentajeTotal categoria esBorrador')
        .populate('localId', 'nombre ciudad direccion')
        .sort({ fechaRevision: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Revision.countDocuments(query),
    ]);

    const data = revisiones.map(rev => ({
      ...rev,
      localNombre: rev.localId?.nombre || rev.localId,
    }));

    res.json({ data, total });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.id)
      .populate('localId', 'nombre ciudad direccion')
      .populate('supervisorId', 'nombre email');

    if (!revision) {
      return res.status(404).json({ error: 'Revision no encontrada' });
    }

    const revisionConNombres = {
      ...revision.toObject(),
      localNombre: revision.localId?.nombre || revision.localId,
      supervisorNombre: revision.supervisorId?.nombre || revision.supervisorNombre
    };

    res.json(revisionConNombres);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/pdf', verifyToken, async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.id)
      .populate('localId', 'nombre ciudad direccion')
      .populate('supervisorId', 'nombre email');
    
    if (!revision) {
      return res.status(404).json({ error: 'Revision no encontrada' });
    }
    
    await generarPDF(res, revision);
    
  } catch (error) {
    console.error('Error generando PDF:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error al generar el PDF: ' + error.message });
    }
  }
});

router.post('/borrador', verifyToken, async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body); // red de seguridad: convierte a archivo cualquier base64 que haya quedado embebido
    let supervisorId = null;
    let supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const borradorData = {
      ...req.body,
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : null,
      supervisorNombre: supervisorNombre,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : null,
      esBorrador: true,
      creadoPor: req.user.nombre,
      creadoPorId: req.user.id,
      creadoEn: new Date(),
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date()
    };

    const borrador = new Revision(borradorData);
    await borrador.save();
    res.status(201).json(borrador);
  } catch (error) {
    console.error('Error en borrador:', error);
    res.status(500).json({ error: error.message });
  }
});


// Actualizar borrador existente (auto-guardado)
router.put('/borrador/:id', verifyToken, async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const borrador = await Revision.findOne({ _id: req.params.id, esBorrador: true });
    if (!borrador) {
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    const updateData = {
      ...req.body,
      esBorrador: true,
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date(),
    };

    // Convertir IDs si vienen como string
    if (req.body.localId) {
      try { updateData.localId = new mongoose.Types.ObjectId(req.body.localId); } catch(e) {}
    }
    if (req.body.supervisorId) {
      try { updateData.supervisorId = new mongoose.Types.ObjectId(req.body.supervisorId); } catch(e) {}
    }

    const updated = await Revision.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );
    res.json(updated);
  } catch (error) {
    console.error('Error actualizando borrador:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    if (req.user.rol !== 'supervisor' && req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
      return res.status(403).json({ error: 'No autorizado para crear revisiones' });
    }

    let supervisorId = null;
    let supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const revisionData = {
      fechaRevision: new Date(req.body.fechaRevision) || new Date(),
      localId: new mongoose.Types.ObjectId(req.body.localId),
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : null,
      supervisorNombre: supervisorNombre,
      administrador: req.body.administrador || {},
      subAdministrador: req.body.subAdministrador || {},
      borranReclamos: req.body.borranReclamos || '',
      servicioCliente: req.body.servicioCliente || {},
      cuartoFrio: req.body.cuartoFrio || {},
      cuartoCaliente: req.body.cuartoCaliente || {},
      porcentajeTotal: Number(req.body.porcentajeTotal) || 0,
      categoria: req.body.categoria || '',
      comentariosGenerales: req.body.comentariosGenerales || '',
      creadoPor: req.user.nombre,
      creadoPorId: req.user.id,
      creadoEn: new Date(),
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date()
    };

    const revision = new Revision(revisionData);
    const savedRevision = await revision.save();
    res.status(201).json(savedRevision);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  try {
    req.body = procesarFotosEnObjeto(req.body);
    const revision = await Revision.findById(req.params.id);
    if (!revision) {
      return res.status(404).json({ error: 'Revision no encontrada' });
    }

    const updateData = {
      fechaRevision: new Date(req.body.fechaRevision) || revision.fechaRevision,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : revision.localId,
      administrador: req.body.administrador || revision.administrador,
      subAdministrador: req.body.subAdministrador || revision.subAdministrador,
      borranReclamos: req.body.borranReclamos || revision.borranReclamos,
      servicioCliente: req.body.servicioCliente || revision.servicioCliente,
      cuartoFrio: req.body.cuartoFrio || revision.cuartoFrio,
      cuartoCaliente: req.body.cuartoCaliente || revision.cuartoCaliente,
      porcentajeTotal: Number(req.body.porcentajeTotal) || revision.porcentajeTotal,
      categoria: req.body.categoria || revision.categoria,
      comentariosGenerales: req.body.comentariosGenerales || revision.comentariosGenerales,
      supervisorNombre: req.user.nombre,
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date()
    };

    const updatedRevision = await Revision.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedRevision);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/borrador/:id/finalizar', verifyToken, async (req, res) => {
  console.log('Finalizando borrador:', req.params.id);
  console.log('Usuario:', req.user.nombre, '(', req.user.rol, ')');

  try {
    req.body = procesarFotosEnObjeto(req.body);
    const borrador = await Revision.findById(req.params.id);
    if (!borrador) {
      console.log('Borrador no encontrado:', req.params.id);
      return res.status(404).json({ error: 'Borrador no encontrado' });
    }

    let supervisorId = null;
    let supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const updateData = {
      ...req.body,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : borrador.localId,
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : borrador.supervisorId,
      supervisorNombre: supervisorNombre,
      esBorrador: false,
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date()
    };

    const finalizada = await Revision.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: false }
    );

    if (!finalizada) {
      return res.status(404).json({ error: 'No se pudo actualizar el borrador' });
    }

    console.log('Borrador finalizado:', finalizada._id);
    res.json(finalizada);
  } catch (error) {
    console.error('Error finalizando borrador:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.id);
    if (!revision) {
      return res.status(404).json({ error: 'Revision no encontrada' });
    }

    if (req.user.rol === 'master') {
      await revision.deleteOne();
      return res.json({ message: 'Revision eliminada' });
    }

    if (req.user.rol === 'supervisor' && revision.supervisorId?.toString() === req.user.id) {
      await revision.deleteOne();
      return res.json({ message: 'Revision eliminada' });
    }

    return res.status(403).json({ error: 'No autorizado' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;