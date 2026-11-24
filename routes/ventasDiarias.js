// Módulo Ventas Diarias
//   POST /api/ventas-diarias/cargar   sube el Excel diario .xlsx (campo "archivo"; hoja "Por Local")
//   GET  /api/ventas-diarias/meta     días cargados (con su venta total), divisiones y última carga
//   GET  /api/ventas-diarias/datos    todos los locales de un día (?fecha=AAAAMMDD)
//   GET  /api/ventas-diarias/serie    venta diaria por local en un rango (?desde=&hasta=&sucursal=)
//   GET  /api/ventas-diarias/cargas   historial de cargas
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const VentaDiaria = require('../models/VentaDiaria');
const VentasDiariasCarga = require('../models/VentasDiariasCarga');
const { procesarExcelVentasDiarias } = require('../utils/ventasDiariasParser');

// Mismo middleware de autenticación que el resto de las rutas
const authModule = require('../middleware/auth');
const auth = typeof authModule === 'function'
  ? authModule
  : (authModule.auth || authModule.protect || authModule.verifyToken || authModule.authenticate);
if (typeof auth !== 'function') {
  throw new Error('routes/ventasDiarias.js: no se encontró el middleware de autenticación en ../middleware/auth');
}

const ROLES_VER = ['master', 'gerencia'];
const ROLES_CARGAR = ['master', 'gerencia'];
const rolDe = (req) => (req.user || req.usuario || {}).rol;
const permitir = (roles) => (req, res, next) =>
  roles.includes(rolDe(req)) ? next() : res.status(403).json({ message: 'No tienes acceso a Ventas Diarias' });

const upload = multer({
  dest: path.join(os.tmpdir(), 'ventas-diarias-uploads'),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) return cb(null, true);
    if (/\.xlsb$/i.test(file.originalname)) return cb(new Error('El archivo es .xlsb: ábrelo en Excel y guárdalo como .xlsx (Libro de Excel)'));
    cb(new Error('El archivo debe ser .xlsx'));
  },
});

const ES_FECHA = /^\d{8}$/;
const CAMPOS_DIA = 'sucursal division fecha fechaComp mes mesComp origen ventaDia ventaDiaComp acumMes acumMesComp ticket ticketComp gp pedidos pedidosComp nuevo -_id';
const cederTurno = () => new Promise((resolve) => setImmediate(resolve));

const router = express.Router();
router.use(auth);

let cargaEnCurso = false;

router.post('/cargar', permitir(ROLES_CARGAR), (req, res) => {
  upload.single('archivo')(req, res, async (errUpload) => {
    if (errUpload) return res.status(400).json({ message: errUpload.message });
    if (!req.file) return res.status(400).json({ message: 'Adjunta el archivo Excel' });
    if (cargaEnCurso) {
      fs.unlink(req.file.path, () => {});
      return res.status(409).json({ message: 'Ya hay una carga en proceso, intenta en unos minutos' });
    }
    cargaEnCurso = true;
    const modo = req.body.modo === 'agregar' ? 'agregar' : 'reemplazar';
    const guardarComparacion = String(req.body.guardarComparacion) !== 'false';
    try {
      // 0) Divisiones ya conocidas, para los locales que el Excel no traiga en sus hojas de división
      const conocidas = {};
      for (const l of await VentaDiaria.aggregate([{ $sort: { fecha: -1 } }, { $group: { _id: '$sucursal', division: { $first: '$division' } } }])) {
        if (l.division) conocidas[l._id] = l.division;
      }

      // 1) Se procesa todo el archivo ANTES de tocar la base: un archivo con error no borra nada.
      const { registros, resumen } = await procesarExcelVentasDiarias(req.file.path, { divisionesPrevias: conocidas });
      const usuario = req.user || req.usuario || {};

      // 1b) Validar cada registro antes de borrar (cediendo el turno al resto del servidor)
      let validados = 0;
      for (const r of registros) {
        await new VentaDiaria(r).validate();
        if (++validados % 20 === 0) await cederTurno();
      }
      if (modo === 'agregar' && await VentaDiaria.findOne({ fecha: resumen.fecha, origen: 'archivo' }).lean()) {
        const e = new Error('Ese día ya está cargado (elige "Reemplazar el día" para sobrescribirlo)');
        e.status = 409;
        throw e;
      }

      // 2) Día de comparación: solo su venta, y solo si ese día no viene de un Excel propio
      const cargaId = new mongoose.Types.ObjectId();
      let semillas = [];
      if (guardarComparacion) {
        const reales = new Set((await VentaDiaria.find({ fecha: resumen.fechaComp, origen: 'archivo' }).select('sucursal -_id').lean()).map((x) => x.sucursal));
        semillas = registros
          .filter((r) => !r.nuevo && !reales.has(r.sucursal))
          .map((r) => ({ sucursal: r.sucursal, division: r.division, fecha: r.fechaComp, mes: Math.floor(r.fechaComp / 100), origen: 'comparacion', ventaDia: r.ventaDiaComp, carga: cargaId }));
      }

      // 3) Reemplazo del día (con respaldo: si Mongo falla a mitad de camino se restaura lo anterior)
      //    Se reemplaza lo que el día ya tenía de un Excel y los datos de comparación de los locales que este Excel sí
      //    trae; los datos de comparación de otros locales se conservan.
      const nombres = registros.map((r) => r.sucursal);
      const filtro = {
        $or: [
          { fecha: resumen.fecha, origen: 'archivo' },
          { fecha: resumen.fecha, origen: 'comparacion', sucursal: { $in: nombres } },
          ...(guardarComparacion ? [{ fecha: resumen.fechaComp, origen: 'comparacion' }] : []),
        ],
      };
      const respaldo = await VentaDiaria.find(filtro).lean();
      try {
        await VentaDiaria.deleteMany(filtro);
        const nuevos = [...registros.map((r) => ({ ...r, carga: cargaId })), ...semillas];
        for (let i = 0; i < nuevos.length; i += 250) {
          await VentaDiaria.insertMany(nuevos.slice(i, i + 250), { ordered: false });
          await cederTurno();
        }
      } catch (errGuardado) {
        try {
          await VentaDiaria.deleteMany({ carga: cargaId });
          if (respaldo.length) await VentaDiaria.insertMany(respaldo, { ordered: false });
        } catch (errRestaurar) {
          console.error('Ventas Diarias: no se pudo restaurar el respaldo tras un error de carga:', errRestaurar);
        }
        throw errGuardado;
      }

      // El historial se registra solo cuando la carga terminó bien
      const carga = await VentasDiariasCarga.create({
        _id: cargaId,
        archivo: req.file.originalname,
        tamano: req.file.size,
        usuario: usuario._id || usuario.id, // el middleware entrega req.user.id
        usuarioNombre: usuario.nombre,
        modo,
        fecha: resumen.fecha,
        fechaComp: resumen.fechaComp,
        locales: resumen.locales,
        registros: registros.length,
        registrosComp: semillas.length,
        ventaTotal: resumen.ventaTotal,
        nuevos: resumen.nuevos.length,
        cuadreOk: resumen.cuadre ? resumen.cuadre.ok : null,
        advertencias: resumen.advertencias.length,
      });

      res.json({ message: 'Archivo cargado', carga, resumen, comparacionGuardada: semillas.length });
    } catch (err) {
      console.error('Ventas Diarias carga:', err);
      res.status(err.status || 400).json({ message: err.message || 'No se pudo procesar el archivo' });
    } finally {
      cargaEnCurso = false;
      fs.unlink(req.file.path, () => {});
    }
  });
});

router.get('/meta', permitir(ROLES_VER), async (req, res) => {
  try {
    const porDia = (origen) => VentaDiaria.aggregate([
      { $match: { origen } },
      { $group: { _id: '$fecha', ventas: { $sum: '$ventaDia' }, locales: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    const reales = await porDia('archivo');
    const comparaciones = await porDia('comparacion');
    const fechas = new Map();
    for (const c of comparaciones) fechas.set(c._id, { fecha: c._id, ventas: c.ventas, locales: c.locales, origen: 'comparacion' });
    for (const r of reales) fechas.set(r._id, { fecha: r._id, ventas: r.ventas, locales: r.locales, origen: 'archivo' });

    // División vigente de cada local = la de su registro más reciente
    const locales = await VentaDiaria.aggregate([
      { $sort: { fecha: -1 } },
      { $group: { _id: '$sucursal', division: { $first: '$division' } } },
      { $sort: { _id: 1 } },
    ]);
    const divisiones = {};
    for (const l of locales) (divisiones[l.division || 'SIN DIVISIÓN'] ||= []).push({ sucursal: l._id });

    const ultimaCarga = await VentasDiariasCarga.findOne().sort({ createdAt: -1 }).lean();
    res.json({
      fechas: [...fechas.values()].sort((a, b) => a.fecha - b.fecha),
      ultimaFecha: reales.length ? reales[reales.length - 1]._id : null,
      divisiones: Object.entries(divisiones).map(([division, ls]) => ({ division, locales: ls })),
      ultimaCarga,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/datos', permitir(ROLES_VER), async (req, res) => {
  try {
    if (!ES_FECHA.test(String(req.query.fecha || ''))) return res.status(400).json({ message: 'Indica el día (fecha=AAAAMMDD)' });
    const filas = await VentaDiaria.find({ fecha: Number(req.query.fecha), origen: 'archivo' }).select(CAMPOS_DIA).lean();
    res.json(filas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/serie', permitir(ROLES_VER), async (req, res) => {
  try {
    const desde = String(req.query.desde || ''); const hasta = String(req.query.hasta || '');
    if (!ES_FECHA.test(desde) || !ES_FECHA.test(hasta)) return res.status(400).json({ message: 'Indica el rango (desde y hasta como AAAAMMDD)' });
    const filtro = { fecha: { $gte: Number(desde), $lte: Number(hasta) } };
    if (req.query.sucursal) filtro.sucursal = String(req.query.sucursal);
    res.json(await VentaDiaria.find(filtro).select('sucursal division fecha origen ventaDia -_id').lean());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/cargas', permitir(ROLES_VER), async (req, res) => {
  try {
    res.json(await VentasDiariasCarga.find().sort({ createdAt: -1 }).limit(20).lean());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
