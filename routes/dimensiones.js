import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const normalizeText = (value) => value == null ? '' : String(value).trim();

const cleanStringList = (value) =>
  Array.isArray(value)
    ? value.map((item) => normalizeText(item)).filter(Boolean)
    : [];

const getNested = async () => {
  const { rows: dimensiones } = await pool.query(
    'SELECT id, nombre, orden FROM dimensiones ORDER BY orden, id'
  );
  const { rows: objetivos } = await pool.query(
    'SELECT id, dimension_id, texto, orden FROM objetivos ORDER BY orden, id'
  );
  const { rows: opciones } = await pool.query(
    'SELECT id, objetivo_id, estrategias, indicadores FROM opciones ORDER BY id'
  );

  const opcionesByObjetivo = new Map();
  for (const opcion of opciones) {
    if (!opcionesByObjetivo.has(opcion.objetivo_id)) opcionesByObjetivo.set(opcion.objetivo_id, []);
    opcionesByObjetivo.get(opcion.objetivo_id).push({
      id: opcion.id,
      estrategias: opcion.estrategias || [],
      indicadores: opcion.indicadores || [],
    });
  }

  const objetivosByDimension = new Map();
  for (const objetivo of objetivos) {
    if (!objetivosByDimension.has(objetivo.dimension_id)) objetivosByDimension.set(objetivo.dimension_id, []);
    objetivosByDimension.get(objetivo.dimension_id).push({
      id: objetivo.id,
      texto: objetivo.texto,
      opciones: opcionesByObjetivo.get(objetivo.id) || [],
    });
  }

  return dimensiones.map((dimension) => ({
    id: dimension.id,
    nombre: dimension.nombre,
    orden: dimension.orden,
    objetivos: objetivosByDimension.get(dimension.id) || [],
  }));
};

router.get('/', async (req, res) => {
  try {
    res.json(await getNested());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const nombre = normalizeText(req.body?.nombre);
    if (!nombre) return res.status(400).json({ error: 'El nombre de la dimensión es requerido' });
    const maxOrden = await pool.query('SELECT COALESCE(MAX(orden), -1)::int AS max_orden FROM dimensiones');
    const result = await pool.query(
      'INSERT INTO dimensiones (nombre, orden) VALUES ($1, $2) RETURNING id, nombre, orden',
      [nombre, maxOrden.rows[0].max_orden + 1]
    );
    res.status(201).json({ ...result.rows[0], objetivos: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const nombre = normalizeText(req.body?.nombre);
    if (!nombre) return res.status(400).json({ error: 'El nombre de la dimensión es requerido' });
    const result = await pool.query(
      'UPDATE dimensiones SET nombre = $1 WHERE id = $2 RETURNING id, nombre, orden',
      [nombre, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dimensión no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM dimensiones WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Dimensión no encontrada' });
    res.json({ mensaje: 'Dimensión eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/objetivos', async (req, res) => {
  try {
    const texto = normalizeText(req.body?.texto);
    if (!texto) return res.status(400).json({ error: 'El texto del objetivo es requerido' });
    const dimCheck = await pool.query('SELECT id FROM dimensiones WHERE id = $1', [req.params.id]);
    if (dimCheck.rows.length === 0) return res.status(404).json({ error: 'Dimensión no encontrada' });
    const maxOrden = await pool.query('SELECT COALESCE(MAX(orden), -1)::int AS max_orden FROM objetivos WHERE dimension_id = $1', [req.params.id]);
    const result = await pool.query(
      'INSERT INTO objetivos (dimension_id, texto, orden) VALUES ($1, $2, $3) RETURNING id, dimension_id, texto, orden',
      [req.params.id, texto, maxOrden.rows[0].max_orden + 1]
    );
    res.status(201).json({ ...result.rows[0], opciones: [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/objetivos/:id', async (req, res) => {
  try {
    const texto = normalizeText(req.body?.texto);
    if (!texto) return res.status(400).json({ error: 'El texto del objetivo es requerido' });
    const result = await pool.query(
      'UPDATE objetivos SET texto = $1 WHERE id = $2 RETURNING id, dimension_id, texto, orden',
      [texto, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Objetivo no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/objetivos/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM objetivos WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Objetivo no encontrado' });
    res.json({ mensaje: 'Objetivo eliminado' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/objetivos/:id/opciones', async (req, res) => {
  try {
    const estrategias = cleanStringList(req.body?.estrategias);
    const indicadores = cleanStringList(req.body?.indicadores);
    const objCheck = await pool.query('SELECT id FROM objetivos WHERE id = $1', [req.params.id]);
    if (objCheck.rows.length === 0) return res.status(404).json({ error: 'Objetivo no encontrado' });
    const result = await pool.query(
      'INSERT INTO opciones (objetivo_id, estrategias, indicadores) VALUES ($1, $2, $3) RETURNING id, estrategias, indicadores',
      [req.params.id, JSON.stringify(estrategias), JSON.stringify(indicadores)]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/opciones/:id', async (req, res) => {
  try {
    const estrategias = cleanStringList(req.body?.estrategias);
    const indicadores = cleanStringList(req.body?.indicadores);
    const result = await pool.query(
      'UPDATE opciones SET estrategias = $1, indicadores = $2 WHERE id = $3 RETURNING id, estrategias, indicadores',
      [JSON.stringify(estrategias), JSON.stringify(indicadores), req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opción no encontrada' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/opciones/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM opciones WHERE id = $1 RETURNING id', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Opción no encontrada' });
    res.json({ mensaje: 'Opción eliminada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
