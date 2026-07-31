import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const connectionString = process.env.SUPABASE_DB_POOLER_URL || process.env.DATABASE_URL;
const useSsl = Boolean(connectionString) && process.env.PGSSLMODE !== 'disable';

const pool = new Pool(
  connectionString
    ? {
        connectionString,
        ssl: useSsl ? { rejectUnauthorized: false } : false,
      }
    : {
        host: 'localhost',
        port: 5432,
        database: 'crud_db',
        user: 'postgres',
        password: 'admin',
      }
);

const initDB = async () => {
  if (process.env.RUN_DB_INIT !== 'true') {
    console.log('RUN_DB_INIT no esta en true, se omite inicializacion de BD.');
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        rut VARCHAR(12) PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL,
        apellido VARCHAR(100) NOT NULL,
        edad INT NOT NULL,
        descripcion VARCHAR(50) GENERATED ALWAYS AS (
          CASE WHEN edad >= 18 THEN 'Mayor de edad' ELSE 'Menor de edad' END
        ) STORED,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS habilitaciones (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(50) NOT NULL,
        edad_min INT NOT NULL,
        edad_max INT NOT NULL,
        resultado VARCHAR(100) NOT NULL,
        descripcion TEXT
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS items (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(120) NOT NULL,
        descripcion TEXT,
        precio NUMERIC(12,2) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    const habCount = await client.query('SELECT COUNT(*)::int AS count FROM habilitaciones');
    if (habCount.rows[0].count === 0) {
      await client.query(`
        INSERT INTO habilitaciones (nombre, edad_min, edad_max, resultado, descripcion) VALUES
        ('Menor de edad', 0, 17, 'No esta habilitado', 'Personas que no han alcanzado la mayoria de edad'),
        ('Mayor de edad', 18, 999, 'Esta habilitado', 'Personas que han alcanzado la mayoria de edad');
      `);
      console.log('Seed de habilitaciones insertado');
    }
    console.log('Tabla habilitaciones lista');

    const usersCount = await client.query('SELECT COUNT(*)::int AS count FROM usuarios');
    if (usersCount.rows[0].count === 0) {
      await client.query(`
        INSERT INTO usuarios (rut, nombre, apellido, edad) VALUES
        ('18.768.749-7', 'Lautaro', 'Garcia', 25),
        ('19.123.456-5', 'Camila', 'Rodriguez', 17),
        ('16.345.789-2', 'Mateo', 'Lopez', 32),
        ('20.123.456-8', 'Valentina', 'Martinez', 15),
        ('15.456.789-1', 'Santiago', 'Fernandez', 19),
        ('12.345.678-9', 'Isabella', 'Gonzalez', 42),
        ('22.567.890-4', 'Benjamin', 'Perez', 8),
        ('9.876.543-2', 'Emilia', 'Sanchez', 55),
        ('19.876.543-3', 'Facundo', 'Romero', 13),
        ('17.654.321-0', 'Martina', 'Torres', 21);
      `);
      console.log('Seed de 10 usuarios insertado');
    }
    console.log('Tabla usuarios lista');

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export { pool, initDB };
