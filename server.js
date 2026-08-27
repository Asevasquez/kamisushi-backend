const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Aumentar límite para fotos
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Servir archivos estáticos (fotos)
app.use('/uploads', express.static('uploads'));

// Conexión MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kamisushi')
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err.message));

// Importar rutas
const authRoutes = require('./routes/auth');
const localRoutes = require('./routes/locales');
const supervisorRoutes = require('./routes/supervisores');
const revisionRoutes = require('./routes/revisiones');
const usuarioRoutes = require('./routes/usuarios');
const estadisticasRoutes = require('./routes/estadisticas'); // ← AGREGAR
const { router: uploadRoutes } = require('./routes/upload');

// Usar rutas
app.use('/api/auth', authRoutes);
app.use('/api/locales', localRoutes);
app.use('/api/supervisores', supervisorRoutes);
app.use('/api/revisiones', revisionRoutes);
app.use('/api/usuarios', usuarioRoutes);
app.use('/api/estadisticas', estadisticasRoutes); // ← AGREGAR
app.use('/api/upload', uploadRoutes); // ← AGREGAR

// Ruta de prueba
app.get('/api/test', (req, res) => {
  res.json({ message: 'Backend funcionando', timestamp: Date.now() });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Red: http://${getLocalIp()}:${PORT}`);
});

function getLocalIp() {
  const { networkInterfaces } = require('os');
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        return net.address;
      }
    }
  }
  return 'localhost';
}