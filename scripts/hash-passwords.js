const bcrypt = require('bcryptjs');

async function hashPasswords() {
  try {
    // Hash default passwords
    const adminPassword = await bcrypt.hash('admin123', 10);
    const demoPassword = await bcrypt.hash('demo123', 10);
    
    console.log('Admin password hash (password: admin123):');
    console.log(adminPassword);
    console.log('\nDemo password hash (password: demo123):');
    console.log(demoPassword);
    
    console.log('\nUpdate init.sql with these hashes:');
    console.log(`Admin: '${adminPassword}'`);
    console.log(`Demo: '${demoPassword}'`);
    
  } catch (error) {
    console.error('Error hashing passwords:', error);
  }
}

hashPasswords();