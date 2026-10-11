import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// 2026-10-09 12:58, #61 follow-up: also cut fractional seconds instead of rounding them up. Rounding stored a check-in made at
// :09.6 as :10, so closing the entry within the same second failed with "Check-in can't be in the future" (flaky ops-s7 on MySQL).
const SESSION_SETUP = "SET time_zone = '+00:00', sql_mode = CONCAT(@@SESSION.sql_mode, ',TIME_TRUNCATE_FRACTIONAL')";

export const createConnection = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 3306, // 2026-10-09 08:25, #46: hosts with MySQL on a non-default port
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'stayguide_dev',
      timezone: '+00:00',
      // 2026-10-08 12:05, #45: DATE columns as 'YYYY-MM-DD' strings (like mock mode), not midnight-UTC Date objects
      dateStrings: ['DATE'],
      // 2026-10-08 13:40, #45: DECIMAL (money, coordinates) as numbers like mock mode; strings broke a + b and showed 34.019500
      decimalNumbers: true
    });

    await connection.query(SESSION_SETUP); // 2026-10-08 12:55, #45: same UTC session as the pool

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
      port: Number(process.env.DB_PORT) || 3306, // 2026-10-09 08:25, #46: hosts with MySQL on a non-default port
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'stayguide_dev',
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      timezone: '+00:00',
      // 2026-10-08 12:05, #45: DATE columns as 'YYYY-MM-DD' strings (like mock mode), not midnight-UTC Date objects
      dateStrings: ['DATE'],
      // 2026-10-08 13:40, #45: DECIMAL (money, coordinates) as numbers like mock mode; strings broke a + b and showed 34.019500
      decimalNumbers: true
    });

    // 2026-10-08 12:55, #45: run every session in UTC. mysql2 sends/reads JS dates as UTC (timezone above), but NOW()/CURRENT_TIMESTAMP
    // use the session time zone (the server's local zone by default), so the two disagreed by the UTC offset on non-UTC servers
    pool.pool.on('connection', (conn: any) => conn.query(SESSION_SETUP));

    console.log('MySQL connection pool created successfully');
    return pool;
  } catch (error) {
    console.error('MySQL pool creation failed:', error);
    throw error;
  }
};

export const db = createPool();