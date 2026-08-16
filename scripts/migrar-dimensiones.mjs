import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { pool } from '../db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const lista = JSON.parse(readFileSync(join(__dirname, 'lista-dimensiones-objetivos.json'), 'utf8'));
const decisiones = JSON.parse(readFileSync(join(__dirname, 'decisiones-dimension.json'), 'utf8'));

const force = process.argv.includes('--force');

const normalize = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const client = await pool.connect();
try {
  await client.query('BEGIN');

  await client.query(`
    CREATE TABLE IF NOT EXISTS dimensiones (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL UNIQUE,
      orden INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS objetivos (
      id SERIAL PRIMARY KEY,
      dimension_id INTEGER NOT NULL REFERENCES dimensiones(id) ON DELETE CASCADE,
      texto TEXT NOT NULL,
      orden INTEGER NOT NULL DEFAULT 0
    );
  `);
  await client.query(`
    CREATE TABLE IF NOT EXISTS opciones (
      id SERIAL PRIMARY KEY,
      objetivo_id INTEGER NOT NULL REFERENCES objetivos(id) ON DELETE CASCADE,
      estrategias JSONB NOT NULL DEFAULT '[]'::jsonb,
      indicadores JSONB NOT NULL DEFAULT '[]'::jsonb
    );
  `);

  if (force) {
    await client.query('DELETE FROM opciones');
    await client.query('DELETE FROM objetivos');
    await client.query('DELETE FROM dimensiones');
  }

  const existing = await client.query('SELECT COUNT(*)::int AS n FROM dimensiones');
  if (existing.rows[0].n > 0) {
    console.log('dimensiones ya pobladas (' + existing.rows[0].n + '), se omite seed. Use --force para re-sembrar.');
    await client.query('COMMIT');
    await pool.end();
    process.exit(0);
  }

  const grupos = lista.Grupos || [];

  const dimValues = [];
  const dimParams = [];
  grupos.forEach((grupo, i) => {
    dimParams.push(grupo.Dimension, i);
    dimValues.push(`($${dimParams.length - 1}, $${dimParams.length})`);
  });
  const dimRes = await client.query(
    `INSERT INTO dimensiones (nombre, orden) VALUES ${dimValues.join(', ')} RETURNING id, nombre`,
    dimParams
  );
  const dimIdByNormalized = new Map();
  dimRes.rows.forEach((r) => dimIdByNormalized.set(normalize(r.nombre), r.id));

  const objValues = [];
  const objParams = [];
  grupos.forEach((grupo, gi) => {
    const dimId = dimIdByNormalized.get(normalize(grupo.Dimension));
    grupo.Objetivos.forEach((texto, oi) => {
      objParams.push(dimId, texto, oi);
      objValues.push(`($${objParams.length - 2}, $${objParams.length - 1}, $${objParams.length})`);
    });
  });
  const objRes = await client.query(
    `INSERT INTO objetivos (dimension_id, texto, orden) VALUES ${objValues.join(', ')} RETURNING id, dimension_id, texto`,
    objParams
  );
  const objIdByKey = new Map();
  objRes.rows.forEach((r) => objIdByKey.set(`${r.dimension_id}::${normalize(r.texto)}`, r.id));

  const opValues = [];
  const opParams = [];
  let dropped = 0;
  for (const regla of decisiones.reglas || []) {
    const dimId = dimIdByNormalized.get(normalize(regla.Dimension));
    for (const opcion of regla.ObjetivosDisponibles || []) {
      const objetivoId = objIdByKey.get(`${dimId}::${normalize(opcion.Objetivo)}`);
      if (!objetivoId) {
        dropped++;
        continue;
      }
      opParams.push(objetivoId, JSON.stringify(opcion.Estrategia || []), JSON.stringify(opcion.Indicador || []));
      opValues.push(`($${opParams.length - 2}, $${opParams.length - 1}, $${opParams.length})`);
    }
  }
  if (opValues.length > 0) {
    await client.query(
      `INSERT INTO opciones (objetivo_id, estrategias, indicadores) VALUES ${opValues.join(', ')}`,
      opParams
    );
  }

  await client.query('COMMIT');
  console.log(`Seed completado: ${grupos.length} dimensiones, ${objRes.rowCount} objetivos, ${opValues.length} opciones (${dropped} opciones sin objetivo en la lista).`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('ROLLED BACK:', err.message);
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
