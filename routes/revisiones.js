const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const Revision = require('../models/Revision');
const Local = require('../models/Local');
const { verifyToken, authorize } = require('../middleware/auth');

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
    'PESIMO': '#d32f2f'
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
    'PESIMO': 'Pesimo'
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

async function generarPDF(res, revision) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const nombreLocal = (typeof revision.localId === 'object' ? revision.localId?.nombre : null) || 'Local';
    const fechaStr = revision.fechaRevision
      ? new Date(revision.fechaRevision).toLocaleDateString('es-CL').replace(/\//g, '-')
      : '';
    const filename = `Revision_${nombreLocal}_${fechaStr}_${revision._id}.pdf`;
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    
    doc.pipe(res);
    doc.font('Helvetica');
    
    // ============================================================
    // HOJA 1: RESUMEN GENERAL (sin reclamos detallados)
    // ============================================================
    
    // TITULO
    doc.fontSize(22)
       .fillColor('#d32f2f')
       .text('KAMI SUSHI', { align: 'center' });
    doc.fontSize(11)
       .fillColor('#666666')
       .text('Sistema de Supervision', { align: 'center' });
    doc.moveDown(0.5);
    
    // LINEA SEPARADORA
    doc.strokeColor('#d32f2f').lineWidth(2);
    doc.moveTo(50, 125).lineTo(545, 125).stroke();
    doc.moveDown(0.5);
    
    // TITULO DEL INFORME
    doc.fontSize(16)
       .fillColor('#333333')
       .text('INFORME DE REVISION', { align: 'center' });
    doc.fontSize(10)
       .fillColor('#888888')
       .text('N°: REV-' + revision._id.toString().slice(-8).toUpperCase(), { align: 'center' });
    doc.moveDown(1.5);
    
    // ========== INFORMACION GENERAL ==========
    doc.fontSize(13).fillColor('#d32f2f').text('INFORMACION GENERAL', { underline: true });
    doc.moveDown(0.5);
    
    const infoItems = [
      { label: 'Local:', value: (typeof revision.localId === 'object' ? revision.localId?.nombre : revision.localId) || 'No especificado' },
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
    doc.moveDown(infoItems.length * 0.5 + 1);
    
    // ========== CALIFICACION GLOBAL ==========
    doc.fontSize(13).fillColor('#d32f2f').text('CALIFICACION GLOBAL', { underline: true });
    doc.moveDown(0.5);
    
    const porcentaje = revision.porcentajeTotal || 0;
    const categoria = revision.categoria || 'Sin categoria';
    const categoriaTexto = getCategoriaTexto(categoria);
    const colorCategoria = getColorCategoria(categoria);
    
    const barWidth = Math.max((porcentaje / 100) * 400, 5);
    doc.rect(50, doc.y, 400, 22).fill('#eeeeee');
    doc.rect(50, doc.y, barWidth, 22).fill(getColorPorcentaje(porcentaje));
    doc.fontSize(14).fillColor('#333333').text(porcentaje + '%', 460, doc.y + 3);
    doc.moveDown(1.2);
    
    doc.fontSize(11).fillColor('#333333').text('Categoria:', 50, doc.y);
    doc.fontSize(13).fillColor(colorCategoria).text(categoriaTexto, 130, doc.y - 1);
    doc.moveDown(1.8);
    
    // ========== KPIs POR SECCION ==========
    doc.fontSize(13).fillColor('#d32f2f').text('KPIS POR SECCION', { underline: true });
    doc.moveDown(0.5);
    
    const secciones = [
      { nombre: 'Servicio al Cliente', data: revision.servicioCliente, peso: '40%' },
      { nombre: 'Cuarto Frio', data: revision.cuartoFrio, peso: '30%' },
      { nombre: 'Cuarto Caliente', data: revision.cuartoCaliente, peso: '30%' }
    ];
    
    for (const seccion of secciones) {
      const respuestas = seccion.data?.respuestas || {};
      const items = Object.keys(respuestas).length;
      const cumplidos = Object.values(respuestas).filter(v => v.cumple === true).length;
      const porcentajeSeccion = items > 0 ? Math.round((cumplidos / items) * 100) : 0;
      const colorSeccion = getColorPorcentaje(porcentajeSeccion);
      
      doc.fontSize(10).fillColor('#333333');
      doc.text(seccion.nombre + ' (' + seccion.peso + '):', 50, doc.y);
      doc.fillColor(colorSeccion);
      doc.text(porcentajeSeccion + '% (' + cumplidos + '/' + items + ')', 250, doc.y - 12);
      doc.moveDown(0.3);
      
      const smallBarWidth = Math.max((porcentajeSeccion / 100) * 200, 2);
      doc.rect(50, doc.y, 200, 8).fill('#eeeeee');
      doc.rect(50, doc.y, smallBarWidth, 8).fill(colorSeccion);
      doc.moveDown(0.8);
    }
    doc.moveDown(1);
    
    // ========== ADMINISTRADORES ==========
    doc.fontSize(13).fillColor('#d32f2f').text('ADMINISTRADORES', { underline: true });
    doc.moveDown(0.5);
    
    const adminNombre = revision.administrador?.nombre || 'N/A';
    const adminPresente = revision.administrador?.presente ? 'Presente' : 'Ausente';
    const subAdminNombre = revision.subAdministrador?.nombre || 'N/A';
    const subAdminPresente = revision.subAdministrador?.presente ? 'Presente' : 'Ausente';
    
    doc.fontSize(10).fillColor('#333333');
    doc.text('Administrador: ' + adminNombre, 50, doc.y);
    doc.text('(' + adminPresente + ')', 230, doc.y - 12);
    doc.moveDown(0.6);
    
    doc.text('Sub Administrador: ' + subAdminNombre, 50, doc.y);
    doc.text('(' + subAdminPresente + ')', 230, doc.y - 12);
    doc.moveDown(0.6);
    
    doc.text('Borran reclamos: ' + (revision.borranReclamos || 'No especificado'), 50, doc.y);
    doc.moveDown(1.5);
    
    // ========== SOLO CONTADOR DE RECLAMOS EN HOJA 1 ==========
    const reclamos = revision.servicioCliente?.reclamos || [];
    doc.fontSize(13).fillColor('#d32f2f').text('RECLAMOS', { underline: true });
    doc.moveDown(0.5);
    
    if (reclamos.length > 0) {
      doc.fontSize(10).fillColor('#d32f2f');
      doc.text('Total de reclamos registrados: ' + reclamos.length, 50, doc.y);
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#888888');
      doc.text('Ver detalle completo en la Hoja 2', 50, doc.y);
    } else {
      doc.fontSize(10).fillColor('#4caf50');
      doc.text('No se registraron reclamos', 50, doc.y);
    }
    doc.moveDown(1.5);
    
    // ========== COMENTARIOS GENERALES ==========
    if (revision.comentariosGenerales) {
      doc.fontSize(13).fillColor('#d32f2f').text('COMENTARIOS GENERALES', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(10).fillColor('#333333');
      
      const comentario = revision.comentariosGenerales;
      const lines = comentario.split('\n');
      for (const line of lines) {
        if (line.trim()) {
          doc.text(line.trim(), 50, doc.y, { width: 500 });
          doc.moveDown(0.2);
        }
      }
    }
    
    // PIE DE PAGINA - HOJA 1
    const footerY1 = doc.page.height - 40;
    doc.fontSize(8).fillColor('#aaaaaa');
    doc.text(
      'Generado por: ' + (revision.creadoPor || 'Sistema') + ' | ' + new Date().toLocaleString('es-CL') + ' | Pagina 1',
      50,
      footerY1,
      { align: 'center' }
    );
    
    // ============================================================
    // HOJA 2: DETALLE DE OBSERVACIONES Y RECLAMOS
    // ============================================================
    doc.addPage();
    
    // TITULO HOJA 2
    doc.fontSize(15).fillColor('#d32f2f').text('DETALLE DE OBSERVACIONES Y RECLAMOS', { align: 'center', underline: true });
    doc.moveDown(0.5);
    doc.fontSize(9).fillColor('#888888');
    doc.text('Este informe detalla todas las observaciones, hallazgos y reclamos de la revision', { align: 'center' });
    doc.moveDown(1);
    
    // ===== SECCION 1: OBSERVACIONES POR AREA =====
    
    // 1.1 SERVICIO AL CLIENTE
    const observacionesSC = Object.entries(revision.servicioCliente?.respuestas || {})
      .filter(([_, v]) => v.cumple === false && v.observacion && v.observacion.trim() !== '');
    
    if (observacionesSC.length > 0) {
      doc.fontSize(12).fillColor('#2196f3').text('SERVICIO AL CLIENTE', { underline: true });
      doc.moveDown(0.3);
      
      for (const [id, respuesta] of observacionesSC) {
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(12).fillColor('#2196f3').text('SERVICIO AL CLIENTE (continuacion)', { underline: true });
          doc.moveDown(0.3);
        }
        
        const yStart = doc.y;
        doc.rect(45, yStart, 500, 50).stroke('#dddddd');
        
        doc.fontSize(9).fillColor('#d32f2f');
        doc.text(id + ':', 55, yStart + 6);
        doc.fontSize(8).fillColor('#333333');
        const textoPregunta = getTextoPreguntaSC(id);
        doc.text(textoPregunta.substring(0, 70), 55, yStart + 18);
        
        if (respuesta.observacion) {
          doc.fontSize(8).fillColor('#666666');
          const obs = respuesta.observacion.length > 80 ? respuesta.observacion.substring(0, 80) + '...' : respuesta.observacion;
          doc.text('Observacion: ' + obs, 55, yStart + 32);
        }
        
        doc.moveDown(1.3);
      }
      doc.moveDown(0.5);
    } else {
      doc.fontSize(10).fillColor('#4caf50');
      doc.text('Servicio al Cliente - Sin observaciones pendientes', 50, doc.y);
      doc.moveDown(1);
    }
    
    // 1.2 CUARTO FRIO
    const observacionesCF = Object.entries(revision.cuartoFrio?.respuestas || {})
      .filter(([_, v]) => v.cumple === false && v.observacion && v.observacion.trim() !== '');
    
    if (observacionesCF.length > 0) {
      if (doc.y > 650) doc.addPage();
      
      doc.fontSize(12).fillColor('#2196f3').text('CUARTO FRIO', { underline: true });
      doc.moveDown(0.3);
      
      for (const [id, respuesta] of observacionesCF) {
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(12).fillColor('#2196f3').text('CUARTO FRIO (continuacion)', { underline: true });
          doc.moveDown(0.3);
        }
        
        const yStart = doc.y;
        doc.rect(45, yStart, 500, 50).stroke('#dddddd');
        
        doc.fontSize(9).fillColor('#d32f2f');
        doc.text(id + ':', 55, yStart + 6);
        doc.fontSize(8).fillColor('#333333');
        const textoPregunta = getTextoPreguntaCF(id);
        doc.text(textoPregunta.substring(0, 70), 55, yStart + 18);
        
        if (respuesta.observacion) {
          doc.fontSize(8).fillColor('#666666');
          const obs = respuesta.observacion.length > 80 ? respuesta.observacion.substring(0, 80) + '...' : respuesta.observacion;
          doc.text('Observacion: ' + obs, 55, yStart + 32);
        }
        
        doc.moveDown(1.3);
      }
      doc.moveDown(0.5);
    } else {
      doc.fontSize(10).fillColor('#4caf50');
      doc.text('Cuarto Frio - Sin observaciones pendientes', 50, doc.y);
      doc.moveDown(1);
    }
    
    // 1.3 CUARTO CALIENTE
    const observacionesCC = Object.entries(revision.cuartoCaliente?.respuestas || {})
      .filter(([_, v]) => v.cumple === false && v.observacion && v.observacion.trim() !== '');
    
    if (observacionesCC.length > 0) {
      if (doc.y > 650) doc.addPage();
      
      doc.fontSize(12).fillColor('#2196f3').text('CUARTO CALIENTE', { underline: true });
      doc.moveDown(0.3);
      
      for (const [id, respuesta] of observacionesCC) {
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(12).fillColor('#2196f3').text('CUARTO CALIENTE (continuacion)', { underline: true });
          doc.moveDown(0.3);
        }
        
        const yStart = doc.y;
        doc.rect(45, yStart, 500, 50).stroke('#dddddd');
        
        doc.fontSize(9).fillColor('#d32f2f');
        doc.text(id + ':', 55, yStart + 6);
        doc.fontSize(8).fillColor('#333333');
        const textoPregunta = getTextoPreguntaCC(id);
        doc.text(textoPregunta.substring(0, 70), 55, yStart + 18);
        
        if (respuesta.observacion) {
          doc.fontSize(8).fillColor('#666666');
          const obs = respuesta.observacion.length > 80 ? respuesta.observacion.substring(0, 80) + '...' : respuesta.observacion;
          doc.text('Observacion: ' + obs, 55, yStart + 32);
        }
        
        doc.moveDown(1.3);
      }
      doc.moveDown(0.5);
    } else {
      doc.fontSize(10).fillColor('#4caf50');
      doc.text('Cuarto Caliente - Sin observaciones pendientes', 50, doc.y);
      doc.moveDown(1);
    }
    
    // ===== SECCION 2: DETALLE DE RECLAMOS =====
    // TODOS los reclamos van aquí, en la hoja 2
    if (reclamos.length > 0) {
      if (doc.y > 600) doc.addPage();
      
      doc.fontSize(12).fillColor('#d32f2f').text('DETALLE DE RECLAMOS', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9).fillColor('#888888');
      doc.text('Total: ' + reclamos.length + ' reclamo(s) registrado(s)', 50, doc.y);
      doc.moveDown(0.5);
      
      for (let i = 0; i < reclamos.length; i++) {
        const reclamo = reclamos[i];
        if (doc.y > 700) {
          doc.addPage();
          doc.fontSize(12).fillColor('#d32f2f').text('DETALLE DE RECLAMOS (continuacion)', { underline: true });
          doc.moveDown(0.5);
        }
        
        const yStart = doc.y;
        doc.rect(45, yStart, 500, 65).fill('#fff5f5').stroke('#d32f2f');
        
        doc.fontSize(9).fillColor('#d32f2f');
        doc.text('Reclamo #' + (i + 1) + ': ' + (reclamo.tipo || 'Sin tipo'), 55, yStart + 8);
        
        doc.fontSize(8).fillColor('#333333');
        let yOffset = 24;
        if (reclamo.telefono) {
          doc.text('Telefono: ' + reclamo.telefono, 55, yStart + yOffset);
          yOffset += 12;
        }
        if (reclamo.entregoSolucion) {
          const colorSolucion = reclamo.entregoSolucion === 'Si' ? '#4caf50' : '#d32f2f';
          doc.fillColor(colorSolucion);
          doc.text('Solucion: ' + reclamo.entregoSolucion, 55, yStart + yOffset);
          yOffset += 12;
        }
        if (reclamo.montoCompensacion && reclamo.montoCompensacion !== '0') {
          doc.fillColor('#333333');
          doc.text('Monto compensacion: $' + reclamo.montoCompensacion, 55, yStart + yOffset);
        }
        
        doc.moveDown(1.5);
      }
    }
    
    // ===== SECCION 3: RESUMEN ESTADISTICO =====
    if (doc.y > 550) doc.addPage();
    
    doc.fontSize(14).fillColor('#d32f2f').text('RESUMEN DE OBSERVACIONES', { align: 'center', underline: true });
    doc.moveDown(1);
    
    const totalObservaciones = observacionesSC.length + observacionesCF.length + observacionesCC.length;
    const totalReclamosCount = reclamos.length;
    
    // Tabla de resumen
    const tableData = [
      { seccion: 'Servicio al Cliente', cantidad: observacionesSC.length },
      { seccion: 'Cuarto Frio', cantidad: observacionesCF.length },
      { seccion: 'Cuarto Caliente', cantidad: observacionesCC.length },
      { seccion: 'Reclamos', cantidad: totalReclamosCount },
      { seccion: 'TOTAL', cantidad: totalObservaciones + totalReclamosCount },
    ];
    
    let yTabla = doc.y;
    
    // Encabezado
    doc.rect(50, yTabla, 400, 20).fill('#d32f2f');
    doc.rect(450, yTabla, 80, 20).fill('#d32f2f');
    doc.fontSize(10).fillColor('#ffffff');
    doc.text('SECCION', 60, yTabla + 4);
    doc.text('CANTIDAD', 460, yTabla + 4);
    yTabla += 20;
    
    // Filas
    const colores = ['#2196f3', '#4caf50', '#ff9800', '#d32f2f', '#333333'];
    for (let i = 0; i < tableData.length; i++) {
      const row = tableData[i];
      const esTotal = i === tableData.length - 1;
      
      doc.rect(50, yTabla, 400, 20).fill(esTotal ? '#f0f0f0' : '#fafafa');
      doc.rect(450, yTabla, 80, 20).fill(esTotal ? '#f0f0f0' : '#fafafa');
      
      doc.fillColor('#333333');
      doc.fontSize(esTotal ? 10 : 9);
      doc.text(row.seccion, 60, yTabla + 4);
      
      doc.fillColor(esTotal ? '#333333' : colores[i]);
      doc.text(row.cantidad.toString(), 470, yTabla + 4);
      yTabla += 20;
    }
    
    doc.moveDown(1.5);
    
    // Grafico de barras
    doc.fontSize(10).fillColor('#333333');
    doc.text('Distribucion de observaciones por seccion:', 50, doc.y);
    doc.moveDown(0.5);
    
    const maxCount = Math.max(...tableData.map(t => t.cantidad), 1);
    const barMaxWidth = 400;
    const coloresBarra = ['#2196f3', '#4caf50', '#ff9800', '#d32f2f'];
    
    for (let i = 0; i < tableData.length - 1; i++) {
      const row = tableData[i];
      const barWidth = Math.max((row.cantidad / maxCount) * barMaxWidth, 5);
      doc.fillColor(coloresBarra[i % coloresBarra.length]);
      doc.rect(50, doc.y, barWidth, 12).fill();
      doc.fillColor('#333333');
      doc.text(row.seccion + ': ' + row.cantidad, barWidth + 60, doc.y + 2);
      doc.moveDown(0.9);
    }
    
    doc.moveDown(1.5);
    
    // CONCLUSION
    doc.fontSize(11).fillColor('#333333');
    doc.text('CONCLUSION:', 50, doc.y);
    doc.moveDown(0.3);
    
    const totalProblemas = totalObservaciones + totalReclamosCount;
    let conclusion = '';
    
    if (totalProblemas === 0) {
      conclusion = 'Excelente desempeno. No se registraron observaciones ni reclamos. Mantener el nivel de calidad.';
    } else if (totalProblemas <= 5) {
      conclusion = 'Desempeno aceptable. Se recomienda abordar las observaciones detectadas en el proximo periodo. Las areas con observaciones deben recibir retroalimentacion inmediata.';
    } else if (totalProblemas <= 10) {
      conclusion = 'Desempeno regular. Es necesario implementar acciones correctivas para las areas con mayor numero de observaciones. Se sugiere una reunion de seguimiento en 15 dias.';
    } else {
      conclusion = 'Desempeno critico. Se requiere una intervencion inmediata y un plan de mejora estructurado para las areas con multiples incumplimientos. Programar capacitacion urgente.';
    }
    
    doc.fontSize(9).fillColor('#666666');
    doc.text(conclusion, { width: 500, align: 'left' });
    
    // PIE DE PAGINA - HOJA 2
    const footerY2 = doc.page.height - 40;
    doc.fontSize(8).fillColor('#aaaaaa');
    doc.text(
      'Generado por: ' + (revision.creadoPor || 'Sistema') + ' | ' + new Date().toLocaleString('es-CL') + ' | Pagina 2',
      50,
      footerY2,
      { align: 'center' }
    );
    
    // FINALIZAR
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
    let query = {};

    if (req.user.rol === 'supervisor') {
      query.supervisorId = req.user.id;
    }

    if (req.user.rol === 'administrador') {
      const localesAsignados = req.user.localesAsignados?.map(l => l._id?.toString() || l) || [];
      if (localesAsignados.length > 0) {
        query.localId = { $in: localesAsignados.map(id => new mongoose.Types.ObjectId(id)) };
      } else {
        return res.json([]);
      }
    }

    const revisiones = await Revision.find(query)
      .populate('localId', 'nombre ciudad direccion')
      .populate('supervisorId', 'nombre email')
      .sort({ fechaRevision: -1 });

    const revisionesConNombres = revisiones.map(rev => ({
      ...rev.toObject(),
      localNombre: rev.localId?.nombre || rev.localId,
      supervisorNombre: rev.supervisorId?.nombre || rev.supervisorNombre
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

router.post('/', verifyToken, async (req, res) => {
  try {
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