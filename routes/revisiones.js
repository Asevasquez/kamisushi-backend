const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const { verifyToken, authorize } = require('../middleware/auth');
const { procesarFotosEnObjeto } = require('./upload');

// ==================== FUNCIONES AUXILIARES ====================

function getTextoPreguntaSC(id) {
  const textos = {
    'SC-01': 'El local cumple con la presentacion y estado fisico del local',
    'SC-02': 'Hay presencia del encargado en el local',
    'SC-03': 'No existen reclamos de clientes',
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

function getTextoPregunta(id) {
  if (id.startsWith('SC')) return getTextoPreguntaSC(id);
  if (id.startsWith('CF')) return getTextoPreguntaCF(id);
  return getTextoPreguntaCC(id);
}

function getColorPorcentaje(porcentaje) {
  if (porcentaje >= 95) return '#4caf50';
  if (porcentaje >= 80) return '#2196f3';
  if (porcentaje >= 70) return '#ff9800';
  if (porcentaje >= 60) return '#f44336';
  return '#d32f2f';
}

// ✅ FIX: Umbrales de categoría corregidos
function getCategoriaDesPorcentaje(porcentaje) {
  if (porcentaje === 100) return 'EXCELENTE';
  if (porcentaje >= 95) return 'MUY BUENO';
  if (porcentaje >= 80) return 'BUENO';
  if (porcentaje >= 70) return 'REGULAR';
  if (porcentaje >= 60) return 'MALO';
  return 'PÉSIMO';
}

function getColorCategoria(categoria) {
  const colores = {
    'EXCELENTE': '#4caf50',
    'MUY BUENO': '#8bc34a',
    'BUENO': '#2196f3',
    'REGULAR': '#ff9800',
    'MALO': '#f44336',
    'PÉSIMO': '#d32f2f',
    'PESIMO': '#d32f2f',
  };
  return colores[categoria] || '#666666';
}

function formatDate(dateString) {
  if (!dateString) return 'Fecha no disponible';
  try {
    return new Date(dateString).toLocaleDateString('es-CL');
  } catch (e) {
    return 'Fecha invalida';
  }
}

// Intenta cargar imagen desde disco (uploads)
function getImagePath(fotoUrl) {
  if (!fotoUrl) return null;
  try {
    // Las fotos se guardan como /uploads/filename o rutas absolutas
    const filename = path.basename(fotoUrl);
    const filePath = path.join(__dirname, '..', 'uploads', filename);
    if (fs.existsSync(filePath)) return filePath;
  } catch (e) {}
  return null;
}

// Dibuja una imagen en el PDF si existe, retorna la altura usada
function dibujarImagen(doc, fotoUrl, x, y, maxWidth = 150, maxHeight = 100) {
  const imgPath = getImagePath(fotoUrl);
  if (!imgPath) return 0;
  try {
    doc.image(imgPath, x, y, { fit: [maxWidth, maxHeight], align: 'center' });
    return maxHeight + 5;
  } catch (e) {
    return 0;
  }
}

// Helper: agregar footer en cada página
function agregarFooter(doc, supervisor, pagina) {
  const footerY = doc.page.height - 35;
  doc.save();
  doc.fontSize(7).fillColor('#aaaaaa');
  doc.text(
    `Generado por: ${supervisor} | ${new Date().toLocaleString('es-CL')} | Pagina ${pagina}`,
    50, footerY, { align: 'center', width: 495 }
  );
  doc.restore();
}

// Helper: verificar espacio y agregar página si necesario
function checkPageBreak(doc, needed = 80) {
  if (doc.y > doc.page.height - needed - 50) {
    doc.addPage();
    return true;
  }
  return false;
}

// ==================== GENERACIÓN DE PDF MEJORADO ====================

async function generarPDF(res, revision) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4', autoFirstPage: true });
    const filename = `revision_${revision._id}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);

    doc.pipe(res);
    doc.font('Helvetica');

    const supervisorNombre = revision.creadoPor || revision.supervisorNombre || 'Sistema';

    // ============================================================
    // PÁGINA 1: RESUMEN GENERAL
    // ============================================================

    // ENCABEZADO
    doc.fontSize(22).fillColor('#d32f2f').text('KAMI SUSHI', { align: 'center' });
    doc.fontSize(11).fillColor('#666666').text('Sistema de Supervision', { align: 'center' });
    doc.moveDown(0.5);

    doc.strokeColor('#d32f2f').lineWidth(2);
    const lineY = doc.y;
    doc.moveTo(50, lineY).lineTo(545, lineY).stroke();
    doc.moveDown(0.8);

    doc.fontSize(16).fillColor('#333333').text('INFORME DE REVISION', { align: 'center' });
    doc.fontSize(10).fillColor('#888888').text('N°: REV-' + revision._id.toString().slice(-8).toUpperCase(), { align: 'center' });
    doc.moveDown(1.5);

    // INFORMACION GENERAL
    doc.fontSize(13).fillColor('#d32f2f').text('INFORMACION GENERAL', { underline: true });
    doc.moveDown(0.5);

    const infoItems = [
      { label: 'Local:', value: revision.localId?.nombre || revision.localNombre || 'No especificado' },
      { label: 'Fecha:', value: formatDate(revision.fechaRevision) },
      { label: 'Supervisor:', value: revision.supervisorNombre || revision.supervisorId?.nombre || 'No especificado' },
      { label: 'Tipo:', value: revision.esBorrador ? 'BORRADOR' : 'FINAL' },
    ];

    let yInfo = doc.y;
    doc.fontSize(10).fillColor('#333333');
    infoItems.forEach((item, i) => {
      const yPos = yInfo + (i * 22);
      doc.text(item.label, 50, yPos, { width: 80 });
      doc.text(item.value, 130, yPos);
    });
    doc.y = yInfo + (infoItems.length * 22) + 10;
    doc.moveDown(1);

    // CALIFICACION GLOBAL
    doc.fontSize(13).fillColor('#d32f2f').text('CALIFICACION GLOBAL', { underline: true });
    doc.moveDown(0.5);

    const porcentaje = revision.porcentajeTotal || 0;
    // ✅ FIX: usar categoria calculada correctamente
    const categoria = getCategoriaDesPorcentaje(porcentaje);
    const colorCategoria = getColorCategoria(categoria);

    const barY = doc.y;
    const barWidth = Math.max((porcentaje / 100) * 400, 5);
    doc.rect(50, barY, 400, 22).fill('#eeeeee');
    doc.rect(50, barY, barWidth, 22).fill(getColorPorcentaje(porcentaje));
    doc.fontSize(14).fillColor('#333333').text(porcentaje.toFixed(1) + '%', 460, barY + 3);
    doc.y = barY + 30;

    doc.fontSize(11).fillColor('#333333').text('Categoria:', 50, doc.y);
    doc.fontSize(13).fillColor(colorCategoria).text(categoria, 130, doc.y - 1);
    doc.moveDown(1.5);

    // ✅ FIX: Nota cuando borran reclamos
    if (revision.borranReclamos === 'Sí' || revision.borranReclamos === 'Si') {
      doc.rect(50, doc.y, 495, 28).fill('#fff3e0');
      doc.fontSize(9).fillColor('#e65100')
        .text('⚠ Servicio al Cliente no evaluado: el local borra reclamos. Puntaje SC asignado: 0%', 58, doc.y - 22, { width: 480 });
      doc.moveDown(1.2);
    }

    // KPIs POR SECCION
    doc.fontSize(13).fillColor('#d32f2f').text('KPIS POR SECCION', { underline: true });
    doc.moveDown(0.5);

    const secciones = [
      { nombre: 'Servicio al Cliente', data: revision.servicioCliente, peso: '40%' },
      { nombre: 'Cuarto Frio', data: revision.cuartoFrio, peso: '30%' },
      { nombre: 'Cuarto Caliente', data: revision.cuartoCaliente, peso: '30%' },
    ];

    for (const seccion of secciones) {
      const respuestas = seccion.data?.respuestas || {};
      const items = Object.keys(respuestas).length;
      const cumplidos = Object.values(respuestas).filter(v => v.cumple === true).length;
      const porcentajeSeccion = items > 0 ? Math.round((cumplidos / items) * 100) : 0;
      const colorSeccion = getColorPorcentaje(porcentajeSeccion);

      const seccionY = doc.y;
      doc.fontSize(10).fillColor('#333333').text(seccion.nombre + ' (' + seccion.peso + '):', 50, seccionY);
      doc.fillColor(colorSeccion).text(porcentajeSeccion + '% (' + cumplidos + '/' + items + ')', 250, seccionY);
      doc.moveDown(0.3);

      const smallBarWidth = Math.max((porcentajeSeccion / 100) * 200, 2);
      const kpiBarY = doc.y;
      doc.rect(50, kpiBarY, 200, 8).fill('#eeeeee');
      doc.rect(50, kpiBarY, smallBarWidth, 8).fill(colorSeccion);
      doc.moveDown(0.9);
    }
    doc.moveDown(0.5);

    // ADMINISTRADORES
    doc.fontSize(13).fillColor('#d32f2f').text('ADMINISTRADORES', { underline: true });
    doc.moveDown(0.5);

    const adminNombre = revision.administrador?.nombre || 'N/A';
    const adminPresente = revision.administrador?.presente ? 'Presente' : 'Ausente';
    const subAdminNombre = revision.subAdministrador?.nombre || 'N/A';
    const subAdminPresente = revision.subAdministrador?.presente ? 'Presente' : 'Ausente';

    doc.fontSize(10).fillColor('#333333');
    const adminY = doc.y;
    doc.text('Administrador: ' + adminNombre, 50, adminY);
    doc.fillColor(revision.administrador?.presente ? '#4caf50' : '#f44336')
       .text('(' + adminPresente + ')', 250, adminY);
    doc.moveDown(0.6);

    const subAdminY = doc.y;
    doc.fillColor('#333333').text('Sub Administrador: ' + subAdminNombre, 50, subAdminY);
    doc.fillColor(revision.subAdministrador?.presente ? '#4caf50' : '#f44336')
       .text('(' + subAdminPresente + ')', 250, subAdminY);
    doc.moveDown(0.6);

    doc.fillColor('#333333').text('Borran reclamos: ' + (revision.borranReclamos || 'No especificado'), 50, doc.y);
    doc.moveDown(1);

    // RECLAMOS - Resumen en página 1
    const reclamos = revision.servicioCliente?.reclamos || [];
    doc.fontSize(13).fillColor('#d32f2f').text('RECLAMOS', { underline: true });
    doc.moveDown(0.5);

    if (reclamos.length > 0) {
      doc.fontSize(10).fillColor('#d32f2f')
         .text('Total: ' + reclamos.length + ' reclamo(s) registrado(s). Ver detalle en pagina siguiente.', 50, doc.y);
    } else {
      doc.fontSize(10).fillColor('#4caf50').text('No se registraron reclamos', 50, doc.y);
    }
    doc.moveDown(1);

    // COMENTARIOS GENERALES
    if (revision.comentariosGenerales) {
      doc.fontSize(13).fillColor('#d32f2f').text('COMENTARIOS GENERALES', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#333333');
      const lines = revision.comentariosGenerales.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          doc.text(line.trim(), 50, doc.y, { width: 495 });
          doc.moveDown(0.3);
        }
      }
    }

    agregarFooter(doc, supervisorNombre, 1);

    // ============================================================
    // PÁGINA 2: DETALLE DE RECLAMOS
    // ============================================================
    doc.addPage();
    let paginaActual = 2;

    doc.fontSize(15).fillColor('#d32f2f')
       .text('DETALLE DE RECLAMOS', { align: 'center', underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#888888')
       .text('Local: ' + (revision.localId?.nombre || revision.localNombre || '—') + ' | Fecha: ' + formatDate(revision.fechaRevision), { align: 'center' });
    doc.moveDown(1);

    if (reclamos.length === 0) {
      doc.fontSize(11).fillColor('#4caf50')
         .text('No se registraron reclamos en esta revision.', { align: 'center' });
      doc.moveDown(1);
    } else {
      doc.fontSize(10).fillColor('#888888')
         .text('Total: ' + reclamos.length + ' reclamo(s)', 50, doc.y);
      doc.moveDown(0.5);

      for (let i = 0; i < reclamos.length; i++) {
        const reclamo = reclamos[i];

        // Calcular altura estimada del bloque (con o sin foto)
        const tieneFoto = !!reclamo.foto;
        const alturaBloque = tieneFoto ? 130 : 75;

        if (doc.y > doc.page.height - alturaBloque - 50) {
          agregarFooter(doc, supervisorNombre, paginaActual);
          doc.addPage();
          paginaActual++;
          doc.fontSize(12).fillColor('#d32f2f')
             .text('DETALLE DE RECLAMOS (continuacion)', { underline: true });
          doc.moveDown(0.5);
        }

        const reclamoY = doc.y;
        const reclamoHeight = alturaBloque;

        // Fondo del reclamo
        doc.rect(45, reclamoY, 505, reclamoHeight).fill('#fff5f5').stroke('#d32f2f');

        // Número y tipo
        doc.fontSize(10).fillColor('#d32f2f')
           .text('Reclamo #' + (i + 1) + ': ' + (reclamo.tipo || 'Sin tipo'), 55, reclamoY + 8);

        // Campos del reclamo
        let offsetY = 24;
        if (reclamo.telefono) {
          doc.fontSize(8).fillColor('#333333')
             .text('Telefono: ' + reclamo.telefono, 55, reclamoY + offsetY);
          offsetY += 14;
        }
        if (reclamo.fecha) {
          doc.fontSize(8).fillColor('#333333')
             .text('Fecha reclamo: ' + formatDate(reclamo.fecha), 55, reclamoY + offsetY);
          offsetY += 14;
        }
        if (reclamo.entregoSolucion) {
          const colorSol = reclamo.entregoSolucion === 'Sí' || reclamo.entregoSolucion === 'Si' ? '#4caf50' : '#d32f2f';
          doc.fontSize(8).fillColor(colorSol)
             .text('Entrego solucion: ' + reclamo.entregoSolucion, 55, reclamoY + offsetY);
          offsetY += 14;
        }
        if (reclamo.montoCompensacion && reclamo.montoCompensacion !== '0' && reclamo.montoCompensacion !== '') {
          doc.fontSize(8).fillColor('#333333')
             .text('Monto compensacion: $' + reclamo.montoCompensacion, 55, reclamoY + offsetY);
          offsetY += 14;
        }

        // Foto del reclamo si existe
        if (tieneFoto) {
          const imgX = 350;
          const imgY = reclamoY + 8;
          const alturaImg = dibujarImagen(doc, reclamo.foto, imgX, imgY, 140, 90);
          if (alturaImg === 0) {
            // Si no se pudo cargar la imagen, mostrar texto
            doc.fontSize(7).fillColor('#888888')
               .text('📸 Foto adjunta (no disponible en PDF)', 350, reclamoY + 35);
          }
        } else {
          doc.fontSize(7).fillColor('#aaaaaa')
             .text('Sin foto', 450, reclamoY + 35);
        }

        doc.y = reclamoY + reclamoHeight + 8;
      }
    }

    agregarFooter(doc, supervisorNombre, paginaActual);

    // ============================================================
    // PÁGINA 3+: DETALLE DE OBSERVACIONES POR ÁREA
    // ============================================================
    doc.addPage();
    paginaActual++;

    doc.fontSize(15).fillColor('#d32f2f')
       .text('DETALLE DE OBSERVACIONES', { align: 'center', underline: true });
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#888888')
       .text('Se muestran solo las preguntas que NO cumplen con observacion o evidencia fotografica', { align: 'center' });
    doc.moveDown(1);

    // Recopilar TODAS las observaciones de las 3 secciones
    const todasObservaciones = [
      ...Object.entries(revision.servicioCliente?.respuestas || {})
        .filter(([, v]) => v.cumple === false)
        .map(([id, v]) => ({ id, ...v, seccion: 'Servicio al Cliente', color: '#2196f3' })),
      ...Object.entries(revision.cuartoFrio?.respuestas || {})
        .filter(([, v]) => v.cumple === false)
        .map(([id, v]) => ({ id, ...v, seccion: 'Cuarto Frio', color: '#4caf50' })),
      ...Object.entries(revision.cuartoCaliente?.respuestas || {})
        .filter(([, v]) => v.cumple === false)
        .map(([id, v]) => ({ id, ...v, seccion: 'Cuarto Caliente', color: '#ff9800' })),
    ];

    if (todasObservaciones.length === 0) {
      doc.fontSize(11).fillColor('#4caf50')
         .text('¡Excelente! No se registraron incumplimientos.', { align: 'center' });
      doc.moveDown(1);
    } else {
      let seccionActual = '';

      for (const obs of todasObservaciones) {
        const tieneFotos = obs.fotos && obs.fotos.length > 0;
        const fotosValidas = tieneFotos ? obs.fotos.filter(f => getImagePath(f)) : [];
        const alturaEstimada = 55 + (fotosValidas.length > 0 ? 110 : 0);

        // Encabezado de sección cuando cambia
        if (obs.seccion !== seccionActual) {
          if (doc.y > doc.page.height - 120) {
            agregarFooter(doc, supervisorNombre, paginaActual);
            doc.addPage();
            paginaActual++;
          }
          seccionActual = obs.seccion;
          doc.fontSize(12).fillColor(obs.color).text(seccionActual.toUpperCase(), { underline: true });
          doc.moveDown(0.4);
        }

        if (doc.y > doc.page.height - alturaEstimada - 50) {
          agregarFooter(doc, supervisorNombre, paginaActual);
          doc.addPage();
          paginaActual++;
          doc.fontSize(10).fillColor(obs.color).text(seccionActual + ' (continuacion)', { underline: true });
          doc.moveDown(0.4);
        }

        const obsY = doc.y;
        const obsHeight = alturaEstimada;

        // Fondo
        doc.rect(45, obsY, 505, obsHeight).fill('#fafafa').stroke('#dddddd');

        // ID y texto de pregunta
        doc.fontSize(9).fillColor('#d32f2f').text(obs.id + ':', 55, obsY + 7);
        doc.fontSize(8).fillColor('#333333')
           .text(getTextoPregunta(obs.id), 55, obsY + 19, { width: fotosValidas.length > 0 ? 260 : 460 });

        // Observacion
        if (obs.observacion && obs.observacion.trim()) {
          const obsTexto = obs.observacion.length > 150 ? obs.observacion.substring(0, 150) + '...' : obs.observacion;
          doc.fontSize(7).fillColor('#666666')
             .text('Observacion: ' + obsTexto, 55, obsY + 33, { width: fotosValidas.length > 0 ? 260 : 460 });
        } else {
          doc.fontSize(7).fillColor('#aaaaaa').text('Sin observacion escrita', 55, obsY + 33);
        }

        // Fotos de evidencia
        if (fotosValidas.length > 0) {
          let imgX = 330;
          for (let fi = 0; fi < Math.min(fotosValidas.length, 2); fi++) {
            dibujarImagen(doc, fotosValidas[fi], imgX, obsY + 5, 100, 80);
            imgX += 110;
          }
          if (obs.fotos.length > 2) {
            doc.fontSize(7).fillColor('#888888')
               .text('+' + (obs.fotos.length - 2) + ' foto(s) más', 330, obsY + 88);
          }
        }

        doc.y = obsY + obsHeight + 6;
      }
    }

    agregarFooter(doc, supervisorNombre, paginaActual);

    // ============================================================
    // ÚLTIMA PÁGINA: RESUMEN ESTADÍSTICO Y CONCLUSIÓN
    // ============================================================
    doc.addPage();
    paginaActual++;

    doc.fontSize(14).fillColor('#d32f2f')
       .text('RESUMEN Y CONCLUSION', { align: 'center', underline: true });
    doc.moveDown(1);

    const observacionesSC = Object.values(revision.servicioCliente?.respuestas || {}).filter(v => v.cumple === false).length;
    const observacionesCF = Object.values(revision.cuartoFrio?.respuestas || {}).filter(v => v.cumple === false).length;
    const observacionesCC = Object.values(revision.cuartoCaliente?.respuestas || {}).filter(v => v.cumple === false).length;
    const totalObservaciones = observacionesSC + observacionesCF + observacionesCC;

    // Tabla resumen
    const tableData = [
      { seccion: 'Servicio al Cliente (40%)', obs: observacionesSC, color: '#2196f3' },
      { seccion: 'Cuarto Frio (30%)', obs: observacionesCF, color: '#4caf50' },
      { seccion: 'Cuarto Caliente (30%)', obs: observacionesCC, color: '#ff9800' },
      { seccion: 'Reclamos registrados', obs: reclamos.length, color: '#d32f2f' },
    ];

    let yTabla = doc.y;
    // Header
    doc.rect(50, yTabla, 400, 22).fill('#d32f2f');
    doc.rect(450, yTabla, 80, 22).fill('#d32f2f');
    doc.fontSize(9).fillColor('#ffffff');
    doc.text('AREA', 60, yTabla + 5);
    doc.text('INCUMPLIMIENTOS', 455, yTabla + 5);
    yTabla += 22;

    for (const row of tableData) {
      doc.rect(50, yTabla, 400, 20).fill('#fafafa').stroke('#eeeeee');
      doc.rect(450, yTabla, 80, 20).fill('#fafafa').stroke('#eeeeee');
      doc.fontSize(9).fillColor('#333333').text(row.seccion, 60, yTabla + 4);
      doc.fillColor(row.obs > 0 ? row.color : '#4caf50').text(row.obs.toString(), 480, yTabla + 4);
      yTabla += 20;
    }

    // Total
    doc.rect(50, yTabla, 400, 22).fill('#f0f0f0').stroke('#dddddd');
    doc.rect(450, yTabla, 80, 22).fill('#f0f0f0').stroke('#dddddd');
    doc.fontSize(10).fillColor('#333333').text('TOTAL', 60, yTabla + 4);
    doc.fillColor(totalObservaciones > 0 ? '#d32f2f' : '#4caf50')
       .text((totalObservaciones + reclamos.length).toString(), 480, yTabla + 4);

    doc.y = yTabla + 40;
    doc.moveDown(1);

    // ✅ FIX: Conclusión basada en porcentaje real, no en cantidad de problemas
    doc.fontSize(12).fillColor('#333333').text('CONCLUSION:', 50, doc.y);
    doc.moveDown(0.4);

    let conclusion = '';
    let colorConclusion = '#333333';

    if (porcentaje === 100) {
      conclusion = 'Desempeño EXCELENTE. El local cumple con todos los estandares establecidos. Mantener el nivel de calidad alcanzado.';
      colorConclusion = '#4caf50';
    } else if (porcentaje >= 95) {
      conclusion = 'Desempeño MUY BUENO (' + porcentaje.toFixed(1) + '%). El local cumple con casi todos los estandares. Abordar puntualmente las observaciones detectadas para alcanzar la excelencia.';
      colorConclusion = '#8bc34a';
    } else if (porcentaje >= 80) {
      conclusion = 'Desempeño BUENO (' + porcentaje.toFixed(1) + '%). El local cumple con los estandares principales. Se recomienda trabajar en las areas con incumplimientos para mejorar el puntaje.';
      colorConclusion = '#2196f3';
    } else if (porcentaje >= 70) {
      conclusion = 'Desempeño REGULAR (' + porcentaje.toFixed(1) + '%). Existen areas de mejora significativas. Es necesario implementar acciones correctivas y realizar seguimiento en 15 dias.';
      colorConclusion = '#ff9800';
    } else if (porcentaje >= 60) {
      conclusion = 'Desempeño MALO (' + porcentaje.toFixed(1) + '%). El local presenta multiples incumplimientos. Se requiere un plan de mejora inmediato y capacitacion del equipo.';
      colorConclusion = '#f44336';
    } else {
      conclusion = 'Desempeño PESIMO (' + porcentaje.toFixed(1) + '%). Situacion critica. Se requiere intervencion inmediata, revision de procesos y capacitacion urgente del equipo completo.';
      colorConclusion = '#d32f2f';
    }

    // Caja de conclusión con color según categoría
    const concY = doc.y;
    doc.rect(45, concY, 505, 60).fill(colorConclusion + '15').stroke(colorConclusion);
    doc.fontSize(9).fillColor(colorConclusion)
       .text(conclusion, 55, concY + 10, { width: 485, align: 'justify' });
    doc.y = concY + 70;
    doc.moveDown(1);

    // Firma
    doc.moveDown(2);
    doc.strokeColor('#cccccc').lineWidth(1);
    const firmaY = doc.y;
    doc.moveTo(150, firmaY).lineTo(400, firmaY).stroke();
    doc.moveDown(0.3);
    doc.fontSize(9).fillColor('#666666')
       .text(revision.supervisorNombre || 'Supervisor', { align: 'center' });
    doc.fontSize(8).fillColor('#aaaaaa').text('Firma del Supervisor', { align: 'center' });

    agregarFooter(doc, supervisorNombre, paginaActual);

    doc.end();
    doc.on('finish', resolve);
    doc.on('error', reject);
  });
}

// ============================================================
// ENDPOINTS
// ============================================================

router.get('/estadisticas-por-local', verifyToken, async (req, res) => {
  try {
    let query = {};

    if (req.user.rol === 'supervisor') {
      query.supervisorId = req.user.id;
    }

    if (req.user.rol === 'administrador') {
      const localesAsignados = req.user.localesAsignados?.map(l => l._id?.toString() || l) || [];
      if (localesAsignados.length > 0) {
        query.localId = { $in: localesAsignados.map(id => new mongoose.Types.ObjectId(id)) };
      } else {
        return res.json({});
      }
    }

    const now = new Date();
    const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1);
    const finMes = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    query.fechaRevision = { $gte: inicioMes, $lte: finMes };

    const revisiones = await Revision.find(query).populate('localId');
    const estadisticasPorLocal = {};

    revisiones.forEach(rev => {
      const nombreLocal = rev.localId?.nombre || 'Local sin nombre';
      if (!estadisticasPorLocal[nombreLocal]) {
        estadisticasPorLocal[nombreLocal] = {
          revisiones: [],
          totalRevisiones: 0,
          promedioPorcentaje: 0,
          localId: rev.localId?._id,
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
    let query = {};
    if (req.user.rol === 'supervisor') query.supervisorId = req.user.id;
    if (req.user.rol === 'administrador') {
      const localesAsignados = req.user.localesAsignados?.map(l => l._id?.toString() || l) || [];
      if (localesAsignados.length > 0) {
        query.localId = { $in: localesAsignados.map(id => new mongoose.Types.ObjectId(id)) };
      } else {
        return res.json([]);
      }
    }

    const revisiones = await Revision.find(query)
      .populate('localId').populate('supervisorId')
      .sort({ fechaRevision: -1 });

    const revisionesConNombres = revisiones.map(rev => ({
      ...rev.toObject(),
      localNombre: rev.localId?.nombre || rev.localId,
      supervisorNombre: rev.supervisorId?.nombre || rev.supervisorNombre,
    }));

    res.json(revisionesConNombres);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', verifyToken, async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.id)
      .populate('localId').populate('supervisorId');

    if (!revision) return res.status(404).json({ error: 'Revision no encontrada' });

    const revisionConNombres = {
      ...revision.toObject(),
      localNombre: revision.localId?.nombre || revision.localId,
      supervisorNombre: revision.supervisorId?.nombre || revision.supervisorNombre,
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
      .populate('localId').populate('supervisorId');

    if (!revision) return res.status(404).json({ error: 'Revision no encontrada' });

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
    let supervisorId = null;
    const supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const borradorData = {
      ...req.body,
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : null,
      supervisorNombre,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : null,
      esBorrador: true,
      creadoPor: req.user.nombre,
      creadoPorId: req.user.id,
      creadoEn: new Date(),
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date(),
    };

    // Procesar fotos base64 → guardar en disco → URL pública
    if (borradorData.servicioCliente) {
      borradorData.servicioCliente = procesarFotosEnObjeto(borradorData.servicioCliente);
    }
    if (borradorData.cuartoFrio) {
      borradorData.cuartoFrio = procesarFotosEnObjeto(borradorData.cuartoFrio);
    }
    if (borradorData.cuartoCaliente) {
      borradorData.cuartoCaliente = procesarFotosEnObjeto(borradorData.cuartoCaliente);
    }

    const borrador = new Revision(borradorData);
    await borrador.save();
    res.status(201).json(borrador);
  } catch (error) {
    console.error('Error en borrador:', error);
    res.status(500).json({ error: error.message });
  }
});

router.post('/', verifyToken, async (req, res) => {
  try {
    if (!['supervisor', 'master', 'gerencia'].includes(req.user.rol)) {
      return res.status(403).json({ error: 'No autorizado para crear revisiones' });
    }

    let supervisorId = null;
    const supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const revisionData = {
      fechaRevision: new Date(req.body.fechaRevision) || new Date(),
      localId: new mongoose.Types.ObjectId(req.body.localId),
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : null,
      supervisorNombre,
      administrador: req.body.administrador || {},
      subAdministrador: req.body.subAdministrador || {},
      borranReclamos: req.body.borranReclamos || '',
      servicioCliente: procesarFotosEnObjeto(req.body.servicioCliente || {}),
      cuartoFrio: procesarFotosEnObjeto(req.body.cuartoFrio || {}),
      cuartoCaliente: procesarFotosEnObjeto(req.body.cuartoCaliente || {}),
      porcentajeTotal: Number(req.body.porcentajeTotal) || 0,
      categoria: req.body.categoria || '',
      comentariosGenerales: req.body.comentariosGenerales || '',
      creadoPor: req.user.nombre,
      creadoPorId: req.user.id,
      creadoEn: new Date(),
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date(),
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
    const revision = await Revision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'Revision no encontrada' });

    const updateData = {
      fechaRevision: new Date(req.body.fechaRevision) || revision.fechaRevision,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : revision.localId,
      administrador: req.body.administrador || revision.administrador,
      subAdministrador: req.body.subAdministrador || revision.subAdministrador,
      borranReclamos: req.body.borranReclamos || revision.borranReclamos,
      servicioCliente: req.body.servicioCliente ? procesarFotosEnObjeto(req.body.servicioCliente) : revision.servicioCliente,
      cuartoFrio: req.body.cuartoFrio ? procesarFotosEnObjeto(req.body.cuartoFrio) : revision.cuartoFrio,
      cuartoCaliente: req.body.cuartoCaliente ? procesarFotosEnObjeto(req.body.cuartoCaliente) : revision.cuartoCaliente,
      porcentajeTotal: Number(req.body.porcentajeTotal) || revision.porcentajeTotal,
      categoria: req.body.categoria || revision.categoria,
      comentariosGenerales: req.body.comentariosGenerales || revision.comentariosGenerales,
      supervisorNombre: req.user.nombre,
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date(),
    };

    const updatedRevision = await Revision.findByIdAndUpdate(req.params.id, updateData, { new: true });
    res.json(updatedRevision);
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/borrador/:id/finalizar', verifyToken, async (req, res) => {
  try {
    const borrador = await Revision.findById(req.params.id);
    if (!borrador) return res.status(404).json({ error: 'Borrador no encontrado' });

    let supervisorId = null;
    const supervisorNombre = req.user.nombre;

    if (req.user.rol === 'supervisor') {
      supervisorId = req.user.id;
    } else if (req.body.supervisorId) {
      supervisorId = req.body.supervisorId;
    }

    const updateData = {
      ...req.body,
      localId: req.body.localId ? new mongoose.Types.ObjectId(req.body.localId) : borrador.localId,
      supervisorId: supervisorId ? new mongoose.Types.ObjectId(supervisorId) : borrador.supervisorId,
      supervisorNombre,
      esBorrador: false,
      modificadoPor: req.user.nombre,
      modificadoPorId: req.user.id,
      modificadoEn: new Date(),
    };

    const finalizada = await Revision.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: false });
    if (!finalizada) return res.status(404).json({ error: 'No se pudo actualizar el borrador' });

    res.json(finalizada);
  } catch (error) {
    console.error('Error finalizando borrador:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  try {
    const revision = await Revision.findById(req.params.id);
    if (!revision) return res.status(404).json({ error: 'Revision no encontrada' });

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
