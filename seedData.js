const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Usuario = require('./models/Usuario');
const Local = require('./models/Local');
const Revision = require('./models/Revision');

async function seedDatabase() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kamisushi');
    console.log('✅ Conectado a MongoDB');

    // Limpiar solo las colecciones necesarias
    await Usuario.deleteMany({});
    await Local.deleteMany({});
    await Revision.deleteMany({});
    console.log('🗑️ Base de datos limpiada');

    // ========== CREAR LOCALES ==========
    const locales = await Local.insertMany([
      { nombre: 'BUIN', direccion: 'Av. Principal 123', ciudad: 'Santiago', activo: true },
      { nombre: 'CERRILLOS', direccion: 'Calle Central 456', ciudad: 'Santiago', activo: true },
      { nombre: 'CONCHALI', direccion: 'Av. del Mar 789', ciudad: 'Santiago', activo: true },
      { nombre: 'PROVIDENCIA', direccion: 'Av. Providencia 1234', ciudad: 'Santiago', activo: true },
      { nombre: 'LAS CONDES', direccion: 'Av. Las Condes 567', ciudad: 'Santiago', activo: true },
    ]);
    console.log(`✅ ${locales.length} locales creados`);

    // ========== CREAR USUARIOS (unificados) ==========
    const usuariosData = [
      {
        nombre: 'Juan Pérez',
        email: 'juan.perez@kamisushi.cl',
        password: await bcrypt.hash('Supervisor123!', 10),
        telefono: '+56912345678',
        rol: 'supervisor',
        localesAsignados: [locales[0]._id, locales[1]._id],
        activo: true,
      },
      {
        nombre: 'María González',
        email: 'maria.gonzalez@kamisushi.cl',
        password: await bcrypt.hash('Supervisor123!', 10),
        telefono: '+56987654321',
        rol: 'supervisor',
        localesAsignados: [locales[2]._id, locales[3]._id],
        activo: true,
      },
      {
        nombre: 'Admin Local',
        email: 'admin@kamisushi.cl',
        password: await bcrypt.hash('Admin123!', 10),
        telefono: '+56911223344',
        rol: 'administrador',
        localesAsignados: [locales[0]._id, locales[1]._id, locales[2]._id],
        activo: true,
      },
      {
        nombre: 'Master Admin',
        email: 'master@kamisushi.cl',
        password: await bcrypt.hash('Master123!', 10),
        telefono: '',
        rol: 'master',
        localesAsignados: [],
        activo: true,
      },
      {
        nombre: 'Gerencia',
        email: 'gerencia@kamisushi.cl',
        password: await bcrypt.hash('Gerencia123!', 10),
        telefono: '',
        rol: 'gerencia',
        localesAsignados: [],
        activo: true,
      },
    ];

    for (const userData of usuariosData) {
      await Usuario.create(userData);
    }
    console.log(`✅ ${usuariosData.length} usuarios creados`);

    // ========== CREAR REVISIONES DE EJEMPLO ==========
    const supervisor = await Usuario.findOne({ email: 'juan.perez@kamisushi.cl' });
    
    for (let i = 0; i < locales.length; i++) {
      const local = locales[i];
      
      const revision = new Revision({
        fechaRevision: new Date(),
        localId: local._id,
        supervisorId: supervisor._id,
        supervisorNombre: supervisor.nombre,
        localNombre: local.nombre,
        administrador: { nombre: 'Carlos López', presente: true },
        subAdministrador: { nombre: 'Ana María', presente: false },
        borranReclamos: 'No',
        servicioCliente: {
          respuestas: {
            'SC-01': { cumple: true, observacion: '' },
            'SC-02': { cumple: true, observacion: '' },
            'SC-03': { cumple: false, observacion: 'Reclamo pendiente' },
            'SC-04': { cumple: true, observacion: '' },
            'SC-05': { cumple: true, observacion: '' },
          },
          reclamos: []
        },
        cuartoFrio: {
          respuestas: {
            'CF-01': { cumple: true, observacion: '' },
            'CF-02': { cumple: true, observacion: '' },
            'CF-03': { cumple: false, observacion: 'Temperatura incorrecta' },
          }
        },
        cuartoCaliente: {
          respuestas: {
            'CC-01': { cumple: true, observacion: '' },
            'CC-02': { cumple: true, observacion: '' },
            'CC-03': { cumple: true, observacion: '' },
          }
        },
        porcentajeTotal: 75 + i * 5,
        categoria: 'BUENO',
        comentariosGenerales: 'Revisión de ejemplo',
      });
      
      await revision.save();
    }
    console.log(`✅ ${locales.length} revisiones de ejemplo creadas`);

    console.log('\n🎉 BASE DE DATOS INICIALIZADA CORRECTAMENTE');
    console.log('\n🔑 CREDENCIALES DE PRUEBA:');
    console.log('   Master:       master@kamisushi.cl / Master123!');
    console.log('   Gerencia:     gerencia@kamisushi.cl / Gerencia123!');
    console.log('   Administrador: admin@kamisushi.cl / Admin123!');
    console.log('   Supervisor:   juan.perez@kamisushi.cl / Supervisor123!');
    console.log('   Supervisor:   maria.gonzalez@kamisushi.cl / Supervisor123!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

seedDatabase();