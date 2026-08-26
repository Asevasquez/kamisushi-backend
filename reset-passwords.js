// backend/reset-passwords.js - Resetear todas las contraseñas a valores conocidos
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const usuariosConocidos = [
  { email: 'master@kamisushi.cl', password: 'Master123!', rol: 'master' },
  { email: 'gerencia@kamisushi.cl', password: 'Gerencia123!', rol: 'gerencia' },
  { email: 'admin@kamisushi.cl', password: 'Admin123!', rol: 'administrador' },
  { email: 'juan.perez@kamisushi.cl', password: 'Supervisor123!', rol: 'supervisor' },
  { email: 'maria.gonzalez@kamisushi.cl', password: 'Supervisor123!', rol: 'supervisor' },
];

async function resetPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kamisushi');
    console.log('✅ Conectado a MongoDB');

    const Usuario = mongoose.connection.collection('usuarios');
    
    for (const userInfo of usuariosConocidos) {
      const hashedPassword = await bcrypt.hash(userInfo.password, 10);
      
      const result = await Usuario.updateOne(
        { email: userInfo.email },
        { 
          $set: { 
            password: hashedPassword,
            rol: userInfo.rol,
            activo: true 
          } 
        }
      );
      
      if (result.matchedCount > 0) {
        console.log(`✅ Actualizado: ${userInfo.email}`);
      } else {
        // Crear usuario si no existe
        await Usuario.insertOne({
          nombre: userInfo.email.split('@')[0].replace('.', ' '),
          email: userInfo.email,
          password: hashedPassword,
          rol: userInfo.rol,
          telefono: '',
          localesAsignados: [],
          activo: true,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        console.log(`✅ Creado: ${userInfo.email}`);
      }
    }
    
    console.log('\n🎉 Contraseñas reseteadas correctamente');
    console.log('\n🔑 CREDENCIALES:');
    usuariosConocidos.forEach(u => {
      console.log(`   ${u.email} / ${u.password}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

resetPasswords();