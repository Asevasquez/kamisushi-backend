// backend/fix-passwords.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function fixPasswords() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kamisushi');
    console.log('✅ Conectado a MongoDB');

    const Usuario = mongoose.connection.collection('usuarios');
    
    // Obtener todos los usuarios
    const usuarios = await Usuario.find({}).toArray();
    console.log(`📋 Encontrados ${usuarios.length} usuarios`);
    
    let actualizados = 0;
    
    for (const user of usuarios) {
      // Si la contraseña no parece estar hasheada (no empieza con $2a$ o $2b$)
      if (!user.password || (!user.password.startsWith('$2a$') && !user.password.startsWith('$2b$'))) {
        console.log(`🔧 Actualizando contraseña para: ${user.email}`);
        
        // Usar la contraseña original si existe, o una por defecto
        let plainPassword = user.password;
        
        // Si la contraseña es muy corta o es "123456", usar la contraseña por defecto
        if (!plainPassword || plainPassword === '123456' || plainPassword.length < 6) {
          plainPassword = 'Supervisor123!';
          console.log(`   ⚠️ Usando contraseña por defecto para ${user.email}`);
        }
        
        const hashedPassword = await bcrypt.hash(plainPassword, 10);
        
        await Usuario.updateOne(
          { _id: user._id },
          { $set: { password: hashedPassword } }
        );
        
        actualizados++;
        console.log(`   ✅ ${user.email} -> contraseña actualizada`);
      } else {
        console.log(`✅ ${user.email} ya tiene contraseña hasheada`);
      }
    }
    
    console.log(`\n🎉 ${actualizados} contraseñas actualizadas`);
    console.log('\n🔑 CREDENCIALES DE PRUEBA:');
    console.log('   master@kamisushi.cl / Master123!');
    console.log('   gerencia@kamisushi.cl / Gerencia123!');
    console.log('   admin@kamisushi.cl / Admin123!');
    console.log('   juan.perez@kamisushi.cl / Supervisor123!');
    console.log('   maria.gonzalez@kamisushi.cl / Supervisor123!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

fixPasswords();