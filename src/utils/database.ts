import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

export const createConnection = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'stayguide_dev',
      timezone: '+00:00'
    });

    console.log('MySQL connection established successfully');
    return connection;
  } catch (error) {
    console.error('MySQL connection failed:', error);
    throw error;
  }
};

export const createPool = () => {
  try {
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'stayguide_dev',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00'
    });

    console.log('MySQL connection pool created successfully');
    return pool;
  } catch (error) {
    console.error('MySQL pool creation failed:', error);
    throw error;
  }
};

export const db = createPool();