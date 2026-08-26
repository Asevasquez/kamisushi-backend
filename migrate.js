// migrate.js - Eliminar colecciones redundantes y migrar datos
const mongoose = require('mongoose');
require('dotenv').config();

async function migrate() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kamisushi');
    console.log('✅ Conectado a MongoDB');

    // 1. Obtener datos de supervisores para migrar a usuarios
    const Supervisores = mongoose.connection.collection('supervisores');
    const Supervisors = mongoose.connection.collection('supervisors');
    const UsuarioLocals = mongoose.connection.collection('usuariolocals');
    const Usuarios = mongoose.connection.collection('usuarios');

    // 2. Migrar datos de supervisores a usuarios si no existen
    const supervisoresData = await Supervisores.find({}).toArray();
    const supervisorsData = await Supervisors.find({}).toArray();
    const allSupervisores = [...supervisoresData, ...supervisorsData];
    
    for (const sup of allSupervisores) {
      const existe = await Usuarios.findOne({ email: sup.email });
      if (!existe && sup.email) {
        await Usuarios.insertOne({
          nombre: sup.nombre,
          email: sup.email,
          telefono: sup.telefono || '',
          fechaContratacion: sup.fechaContratacion || new Date(),
          password: '$2a$10$placeholder', // Deberán resetear password
          rol: 'supervisor',
          localesAsignados: [],
          activo: sup.activo !== false,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`✅ Migrado supervisor: ${sup.nombre}`);
      }
    }

    // 3. Migrar asignaciones de usuariolocals a localesAsignados
    const asignaciones = await UsuarioLocals.find({ activo: true }).toArray();
    for (const asig of asignaciones) {
      await Usuarios.updateOne(
        { _id: asig.usuarioId },
        { $addToSet: { localesAsignados: asig.localId } }
      );
    }
    console.log(`✅ Migradas ${asignaciones.length} asignaciones`);

    // 4. Eliminar colecciones redundantes
    await mongoose.connection.dropCollection('supervisores').catch(() => console.log('⚠️ supervisores no existe'));
    await mongoose.connection.dropCollection('supervisors').catch(() => console.log('⚠️ supervisors no existe'));
    await mongoose.connection.dropCollection('usuariolocals').catch(() => console.log('⚠️ usuariolocals no existe'));
    
    console.log('🗑️ Colecciones redundantes eliminadas');

    console.log('\n🎉 MIGRACIÓN COMPLETADA');
    console.log('Colecciones finales: usuarios, locals, revisions, estadisticas');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

migrate();