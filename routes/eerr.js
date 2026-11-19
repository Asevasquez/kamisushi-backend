// Módulo Estado de Resultados (EERR)
//   POST /api/eerr/cargar    sube el Excel consolidado (campo "archivo")
//   GET  /api/eerr/meta      períodos, grupos, locales, analistas y última carga
//   GET  /api/eerr/datos     totales por local y mes (sin detalle)
//   POST /api/eerr/detalle   detalle por concepto para dos períodos y un set de locales
//   GET  /api/eerr/cargas    historial de cargas
const express = require('express');
const fs = require('fs');
const os = require('os');
const path = require('path');
const mongoose = require('mongoose');
const multer = require('multer');
const EerrMensual = require('../models/EerrMensual');
const EerrCarga = require('../models/EerrCarga');
const { procesarExcelEerr } = require('../utils/eerrParser');

// ⚠ Usa el mismo middleware de autenticación que el resto de tus rutas.
// Se acepta export por defecto o con nombre (auth / protect / verifyToken / authenticate).
const authModule = require('../middleware/auth');
const auth = typeof authModule === 'function'
  ? authModule
  : (authModule.auth || authModule.protect || authModule.verifyToken || authModule.authenticate);
if (typeof auth !== 'function') {
  throw new Error('routes/eerr.js: no se encontró el middleware de autenticación en ../middleware/auth');
}

const ROLES_VER = ['master', 'gerencia'];
const ROLES_CARGAR = ['master', 'gerencia'];

const rolDe = (req) => (req.user || req.usuario || {}).rol;
const permitir = (roles) => (req, res, next) =>
  roles.includes(rolDe(req)) ? next() : res.status(403).json({ message: 'No tienes acceso a Estado de Resultados' });

const upload = multer({
  dest: path.join(os.tmpdir(), 'eerr-uploads'),
  limits: { fileSize: 60 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/\.xlsx$/i.test(file.originalname)) return cb(null, true);
    cb(new Error('El archivo debe ser .xlsx'));
  },
});

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
    const modo = req.body.modo === 'todo' ? 'todo' : 'meses';
    try {
      // 1) Se procesa todo el archivo ANTES de tocar la base: un archivo con error no borra nada.
      const { registros, resumen } = await procesarExcelEerr(req.file.path);
      const usuario = req.user || req.usuario || {};

      // 1b) Se valida cada registro ANTES de borrar nada: un local y mes repetido, un concepto que Mongoose no
      //     acepta (por ejemplo con un punto en el nombre) o un dato obligatorio faltante harían fallar el guardado
      //     cuando los meses anteriores ya estuvieran borrados.
      const vistos = new Set();
      for (const r of registros) {
        const clave = `${r.sucursal}|${r.periodo}`;
        if (vistos.has(clave)) throw new Error(`El archivo trae más de una fila para ${r.sucursal} en el período ${r.periodo}`);
        vistos.add(clave);
        await new EerrMensual(r).validate();
      }

      // 2) Reemplazo: solo los meses que trae el archivo, o todo el histórico. Se guarda un respaldo de lo que se
      //    va a reemplazar y, si algo falla a mitad de camino, se restaura (no hay transacciones en un Mongo simple).
      const cargaId = new mongoose.Types.ObjectId();
      const filtro = modo === 'todo' ? {} : { periodo: { $in: resumen.periodos } };
      const respaldo = await EerrMensual.find(filtro).lean();
      try {
        await EerrMensual.deleteMany(filtro);
        for (let i = 0; i < registros.length; i += 1000) {
          const lote = registros.slice(i, i + 1000).map((r) => ({ ...r, carga: cargaId }));
          await EerrMensual.insertMany(lote, { ordered: false });
        }
      } catch (errGuardado) {
        try {
          await EerrMensual.deleteMany({ carga: cargaId });
          if (respaldo.length) await EerrMensual.insertMany(respaldo, { ordered: false });
        } catch (errRestaurar) {
          console.error('EERR: no se pudo restaurar el respaldo tras un error de carga:', errRestaurar);
        }
        throw errGuardado;
      }

      // El historial se registra solo cuando la carga terminó bien
      const carga = await EerrCarga.create({
        _id: cargaId,
        archivo: req.file.originalname,
        tamano: req.file.size,
        usuario: usuario._id || usuario.id, // el middleware entrega req.user.id
        usuarioNombre: usuario.nombre,
        modo,
        filas: resumen.filas,
        locales: resumen.locales,
        registros: registros.length,
        desde: resumen.periodos[0],
        hasta: resumen.periodos[resumen.periodos.length - 1],
        meses: resumen.periodos.length,
        conceptosUnificados: resumen.conceptosUnificados.length,
      });

      res.json({ message: 'Archivo cargado', carga, resumen });
    } catch (err) {
      console.error('EERR carga:', err);
      res.status(400).json({ message: err.message || 'No se pudo procesar el archivo' });
    } finally {
      cargaEnCurso = false;
      fs.unlink(req.file.path, () => {});
    }
  });
});

router.get('/meta', permitir(ROLES_VER), async (req, res) => {
  try {
    const porPeriodo = await EerrMensual.aggregate([
      { $group: { _id: '$periodo', ventas: { $sum: '$ventasTotales' } } },
      { $sort: { _id: 1 } },
    ]);
    // Un mes se considera cerrado si sus ventas son al menos la mitad de las del mes previo
    // (el Excel trae el mes en curso con valores en cero o parciales).
    let ultimoCerrado = null;
    porPeriodo.forEach((p, i) => {
      const prev = i > 0 ? porPeriodo[i - 1].ventas : 0;
      if (p.ventas > 0 && (i === 0 || p.ventas >= prev * 0.5)) ultimoCerrado = p._id;
    });

    // Grupo y analista vigentes de cada local = los de su registro más reciente
    const locales = await EerrMensual.aggregate([
      { $sort: { periodo: -1 } },
      { $group: { _id: '$sucursal', un: { $first: '$un' }, analista: { $first: '$analista' }, ultimo: { $first: '$periodo' } } },
      { $sort: { _id: 1 } },
    ]);
    const grupos = {};
    for (const l of locales) {
      const g = l.un || 'SIN GRUPO';
      (grupos[g] ||= []).push({ sucursal: l._id, analista: l.analista, ultimo: l.ultimo });
    }

    const ultimaCarga = await EerrCarga.findOne().sort({ createdAt: -1 }).lean();
    res.json({
      periodos: porPeriodo.map((p) => ({ periodo: p._id, ventas: p.ventas })),
      ultimoCerrado,
      grupos: Object.entries(grupos).map(([un, ls]) => ({ un, locales: ls })),
      analistas: [...new Set(locales.map((l) => l.analista).filter(Boolean))].sort(),
      ultimaCarga,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/datos', permitir(ROLES_VER), async (req, res) => {
  try {
    const filtro = {};
    const desde = Number(req.query.desde);
    const hasta = Number(req.query.hasta);
    if (desde || hasta) {
      filtro.periodo = {};
      if (desde) filtro.periodo.$gte = desde;
      if (hasta) filtro.periodo.$lte = hasta;
    }
    const datos = await EerrMensual.find(filtro)
      .select('sucursal un analista periodo ventasTotales ventasAgua despachos compras gpi adm rem margenNeto -_id')
      .lean();
    res.json(datos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/detalle', permitir(ROLES_VER), async (req, res) => {
  try {
    const { a, b, sucursales } = req.body || {};
    const rangos = [a, b].filter((r) => r && r.desde && r.hasta);
    if (!rangos.length) return res.status(400).json({ message: 'Indica los períodos a comparar' });
    const filtro = { $or: rangos.map((r) => ({ periodo: { $gte: Number(r.desde), $lte: Number(r.hasta) } })) };
    if (Array.isArray(sucursales) && sucursales.length) filtro.sucursal = { $in: sucursales };

    const docs = await EerrMensual.find(filtro).select('periodo detalle -_id').lean();
    const dentro = (p, r) => r && p >= Number(r.desde) && p <= Number(r.hasta);
    const acc = {};
    for (const d of docs) {
      const enA = dentro(d.periodo, a);
      const enB = dentro(d.periodo, b);
      for (const [k, v] of Object.entries(d.detalle || {})) {
        const fila = (acc[k] ||= { a: 0, b: 0 });
        if (enA) fila.a += v;
        if (enB) fila.b += v;
      }
    }
    res.json(Object.entries(acc).map(([k, v]) => {
      const [campo, ...resto] = k.split('|');
      return { campo, concepto: resto.join('|'), a: v.a, b: v.b };
    }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/cargas', permitir(ROLES_VER), async (req, res) => {
  try {
    res.json(await EerrCarga.find().sort({ createdAt: -1 }).limit(20).lean());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
