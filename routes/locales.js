const express = require('express');
const router = express.Router();
const Local = require('../models/Local');
const { verifyToken } = require('../middleware/auth');

const ETIQUETA = { nombre: 'nombre', direccion: 'dirección', ciudad: 'ciudad', activo: 'estado', codigoExterno: 'código' };

// Deja solo los campos conocidos (nada de _id ni otros) y quita los espacios sobrantes de los
// textos: así "   " ya no cuenta como un nombre válido. Si codigoExterno viene vacío se omite
// en vez de guardarlo como "" — así el índice sparse+unique no choca entre locales sin código
// (un "" guardado de verdad SÍ cuenta como valor duplicado para Mongo, a diferencia de un
// campo ausente). "codigoVacio" indica que, al editar, hay que quitarlo del local.
function normalizarLocal(body) {
  const b = body && typeof body === 'object' ? body : {};
  const datos = {};
  for (const c of ['nombre', 'direccion', 'ciudad']) {
    if (b[c] !== undefined) datos[c] = typeof b[c] === 'string' ? b[c].trim() : b[c];
  }
  if (b.activo !== undefined) datos.activo = b.activo === 'true' ? true : b.activo === 'false' ? false : b.activo;
  const tieneCodigo = typeof b.codigoExterno === 'string';
  const codigo = tieneCodigo ? b.codigoExterno.trim() : '';
  if (codigo) datos.codigoExterno = codigo;
  return { datos, codigoVacio: tieneCodigo && !codigo };
}

// Antes, cualquier error que no fuera "duplicado" salía como un 500 genérico y sin registrarse
// (por ejemplo, faltar la dirección o la ciudad). Ahora cada caso responde con el motivo, y los
// errores realmente inesperados quedan en el log del servidor.
function responderError(res, error, accion) {
  if (error.code === 11000) {
    const campo = Object.keys(error.keyPattern || {})[0] || 'valor';
    return res.status(400).json({ error: `Ya existe un local con ese ${ETIQUETA[campo] || campo}` });
  }
  if (error.name === 'ValidationError') {
    const faltan = [];
    const invalidos = [];
    // En el mismo orden en que aparecen en el formulario
    const orden = Object.keys(ETIQUETA);
    const campos = Object.entries(error.errors || {}).sort(([a], [b]) => orden.indexOf(a) - orden.indexOf(b));
    for (const [campo, e] of campos) {
      (e.kind === 'required' ? faltan : invalidos).push(ETIQUETA[campo] || campo);
    }
    const partes = [];
    if (faltan.length) partes.push(`Completa ${faltan.length > 1 ? 'los campos' : 'el campo'}: ${faltan.join(', ')}`);
    if (invalidos.length) partes.push(`Valor no válido en: ${invalidos.join(', ')}`);
    return res.status(400).json({ error: partes.join('. ') || 'Datos del local no válidos' });
  }
  if (error.name === 'CastError') {
    return res.status(400).json({ error: error.path === '_id' ? 'Local no válido' : `Valor no válido en: ${ETIQUETA[error.path] || error.path}` });
  }
  console.error(`Error al ${accion} local:`, error);
  return res.status(500).json({ error: 'Error en el servidor' });
}

// Antes era pública (sin verifyToken) — ahora requiere sesión para poder
// saber quién pregunta y filtrar según sus locales asignados. La app
// siempre tiene un token por este punto (se usa ya logueado, al crear una
// revisión), así que esto no debería afectar el flujo normal.
router.get('/activos', verifyToken, async (req, res) => {
  try {
    // Administrador y Supervisor Interno solo ven sus locales asignados al
    // elegir dónde hacer una revisión — el resto de los roles (supervisor,
    // gerencia, master, auditor) sigue viendo todos los locales activos,
    // igual que hasta ahora.
    if (['administrador', 'supervisorinterno'].includes(req.user.rol)) {
      const asignados = (req.user.localesAsignados || []).map(l => l._id || l);
      const locales = await Local.find({ _id: { $in: asignados }, activo: true });
      return res.json(locales);
    }
    const locales = await Local.find({ activo: true });
    res.json(locales);
  } catch (error) {
    console.error('Error al listar locales activos:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

// Rutas protegidas (solo master)
router.get('/', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master' && req.user.rol !== 'gerencia') {
    return res.status(403).json({ error: 'Acceso denegado' });
  }
  try {
    const locales = await Local.find();
    res.json(locales);
  } catch (error) {
    console.error('Error al listar locales:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

router.post('/', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede crear locales' });
  }
  try {
    const { datos } = normalizarLocal(req.body);
    const local = new Local(datos);
    await local.save();
    res.status(201).json(local);
  } catch (error) {
    responderError(res, error, 'crear');
  }
});

router.put('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede editar locales' });
  }
  try {
    const { datos, codigoVacio } = normalizarLocal(req.body);
    const update = codigoVacio ? { $set: datos, $unset: { codigoExterno: 1 } } : { $set: datos };
    const local = await Local.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true });
    if (!local) return res.status(404).json({ error: 'Local no encontrado' });
    res.json(local);
  } catch (error) {
    responderError(res, error, 'editar');
  }
});

router.delete('/:id', verifyToken, async (req, res) => {
  if (req.user.rol !== 'master') {
    return res.status(403).json({ error: 'Solo master puede eliminar locales' });
  }
  try {
    await Local.findByIdAndDelete(req.params.id);
    res.json({ message: 'Local eliminado' });
  } catch (error) {
    console.error('Error al eliminar local:', error);
    res.status(500).json({ error: 'Error en el servidor' });
  }
});

module.exports = router;
