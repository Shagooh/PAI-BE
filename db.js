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
        fecha_nacimiento DATE,
        equipo_tratante VARCHAR(150),
        estado_motivacional VARCHAR(120),
        programa VARCHAR(150),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Keep existing databases in sync when table was created before these fields existed.
    await client.query(`
      ALTER TABLE usuarios
      ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE,
      ADD COLUMN IF NOT EXISTS equipo_tratante VARCHAR(150),
      ADD COLUMN IF NOT EXISTS estado_motivacional VARCHAR(120),
      ADD COLUMN IF NOT EXISTS programa VARCHAR(150);
    `);

    await client.query(`
      ALTER TABLE usuarios
      DROP COLUMN IF EXISTS descripcion;
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

    await client.query(`
      CREATE TABLE IF NOT EXISTS fichas (
        rut VARCHAR(12) PRIMARY KEY REFERENCES usuarios(rut) ON DELETE CASCADE,
        meta TEXT,
        decisiones JSONB NOT NULL DEFAULT '[]'::jsonb,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
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
        INSERT INTO usuarios (rut, nombre, apellido, edad, fecha_nacimiento, equipo_tratante, estado_motivacional, programa) VALUES
        ('18.768.749-7', 'Lautaro', 'Garcia', 25, '2001-06-12', 'Equipo A', 'Alto', 'Programa Integral'),
        ('19.123.456-5', 'Camila', 'Rodriguez', 17, '2009-03-08', 'Equipo B', 'Medio', 'Programa Jovenes'),
        ('16.345.789-2', 'Mateo', 'Lopez', 32, '1994-10-21', 'Equipo C', 'Alto', 'Programa Adultos'),
        ('20.123.456-8', 'Valentina', 'Martinez', 15, '2011-01-30', 'Equipo A', 'Bajo', 'Programa Escolar'),
        ('15.456.789-1', 'Santiago', 'Fernandez', 19, '2007-09-14', 'Equipo B', 'Medio', 'Programa Transicion'),
        ('12.345.678-9', 'Isabella', 'Gonzalez', 42, '1984-05-02', 'Equipo C', 'Alto', 'Programa Familiar'),
        ('22.567.890-4', 'Benjamin', 'Perez', 8, '2018-12-19', 'Equipo A', 'Medio', 'Programa Inicial'),
        ('9.876.543-2', 'Emilia', 'Sanchez', 55, '1971-07-07', 'Equipo D', 'Alto', 'Programa Senior'),
        ('19.876.543-3', 'Facundo', 'Romero', 13, '2013-04-25', 'Equipo B', 'Bajo', 'Programa Escolar'),
        ('17.654.321-0', 'Martina', 'Torres', 21, '2005-11-11', 'Equipo C', 'Medio', 'Programa Insercion');
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
