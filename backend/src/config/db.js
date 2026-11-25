import 'dotenv/config';
import pg from 'pg';

// Patrón Singleton: una única instancia del pool de conexiones para toda la app.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
});

export const query = (text, params) => pool.query(text, params);
