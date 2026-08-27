const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { verifyToken } = require('../middleware/auth');

const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');

// Asegurarse que el directorio existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Convierte un string base64 a archivo en disco y retorna la URL pública
function guardarBase64(base64String, prefijo = 'foto') {
  if (!base64String || !base64String.startsWith('data:image')) return null;

  try {
    // Extraer el tipo y los datos
    const matches = base64String.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!matches) return null;

    const ext = matches[1] === 'jpeg' ? 'jpg' : matches[1];
    const data = matches[2];
    const filename = `${prefijo}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const filepath = path.join(UPLOADS_DIR, filename);

    fs.writeFileSync(filepath, Buffer.from(data, 'base64'));
    return `/uploads/${filename}`;
  } catch (e) {
    console.error('Error guardando imagen base64:', e);
    return null;
  }
}

// Procesa recursivamente un objeto y convierte base64 a archivos
function procesarFotosEnObjeto(obj, prefijo = 'foto') {
  if (!obj || typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj.map(item => procesarFotosEnObjeto(item, prefijo));
  }

  const resultado = {};
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'fotos' && Array.isArray(value)) {
      // Array de fotos en respuestas
      resultado[key] = value.map(foto => {
        if (typeof foto === 'string' && foto.startsWith('data:image')) {
          return guardarBase64(foto, 'evidencia') || foto;
        }
        return foto;
      });
    } else if (key === 'foto' && typeof value === 'string' && value.startsWith('data:image')) {
      // Foto única en reclamo
      resultado[key] = guardarBase64(value, 'reclamo') || value;
    } else if (typeof value === 'object' && value !== null) {
      resultado[key] = procesarFotosEnObjeto(value, prefijo);
    } else {
      resultado[key] = value;
    }
  }
  return resultado;
}

// Endpoint directo para subir una foto
router.post('/foto', verifyToken, (req, res) => {
  try {
    const { base64, prefijo } = req.body;
    if (!base64) return res.status(400).json({ error: 'base64 requerido' });

    const url = guardarBase64(base64, prefijo || 'foto');
    if (!url) return res.status(400).json({ error: 'Imagen inválida' });

    res.json({ url });
  } catch (error) {
    console.error('Error subiendo foto:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = { router, procesarFotosEnObjeto };
