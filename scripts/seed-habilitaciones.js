import 'dotenv/config';
import { pool } from '../db.js';
import { readFile } from 'fs/promises';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const shouldTruncate = process.argv.includes('--truncate');
const fileArg = process.argv.find((arg) => arg.startsWith('--file='));
const jsonFilePath = fileArg
  ? resolve(process.cwd(), fileArg.replace('--file=', ''))
  : resolve(__dirname, 'habilitaciones.seed.json');

const validate = (row) => {
  const required = ['nombre', 'edad_min', 'edad_max', 'resultado'];
  for (const key of required) {
    if (row[key] === undefined || row[key] === null || row[key] === '') {
      throw new Error(`Dato invalido: falta ${key} en una fila.`);
    }
  }
};

const loadRows = async () => {
  const raw = await readFile(jsonFilePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error('El JSON de habilitaciones debe contener un array de filas.');
  }
  return parsed;
};

const seedHabilitaciones = async () => {
  const rows = await loadRows();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    if (shouldTruncate) {
      await client.query('TRUNCATE TABLE habilitaciones RESTART IDENTITY');
      console.log('Tabla habilitaciones truncada.');
    }

    console.log(`Cargando filas desde: ${jsonFilePath}`);

    for (const row of rows) {
      validate(row);
      await client.query(
        `
          INSERT INTO habilitaciones (nombre, edad_min, edad_max, resultado, descripcion)
          VALUES ($1, $2, $3, $4, $5)
          ON CONFLICT (nombre, edad_min, edad_max) DO UPDATE SET
            resultado = EXCLUDED.resultado,
            descripcion = EXCLUDED.descripcion
        `,
        [row.nombre, row.edad_min, row.edad_max, row.resultado, row.descripcion || null]
      );
    }

    await client.query('COMMIT');
    console.log(`Seed aplicado: ${rows.length} filas en habilitaciones.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
};

seedHabilitaciones().catch((error) => {
  console.error('Error al insertar datos en habilitaciones:', error.message);
  process.exit(1);
});
