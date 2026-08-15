import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const NEW_USER_COLUMNS = {
  situacion: 'Situación',
  fecha_ingreso: 'FECHA DE INGRESO',
  rut: 'RUT',
  nombre_apellidos: 'NOMBRE Y APELLIDOS',
  convenio_senda: 'CONVENIO SENDA',
  fecha_tentativa_ev_in: 'FECHA TENTATIVA EV IN',
  gestor: 'GESTOR',
  fecha_ev_integral: 'FECHA EV INTEGRAL',
  fecha_ultimo_pci: 'FECHA ÚLTIMO PCI',
  tiempo_pci: 'TIEMPO PCI',
  fecha_proximo_pci: 'FECHA PRÓXIMO PCI',
  tiempo_pci_1: 'TIEMPO PCI_1',
  fecha_proximo_pci_1: 'FECHA PRÓXIMO PCI_1',
  tiempo_pci_2: 'TIEMPO PCI_2',
  fecha_proximo_pci_2: 'FECHA PRÓXIMO PCI_2',
};

const toCleanString = (value) => value == null ? '' : String(value).trim();

const formatRut = (value) => {
  const cleaned = String(value ?? '').replace(/[^0-9Kk]/g, '');
  if (!cleaned) return '';
  const dv = cleaned.slice(-1).toUpperCase();
  const body = cleaned.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${body}-${dv}`;
};

const normalizeRutKey = (value) => String(value ?? '').replace(/[^0-9Kk]/g, '').toUpperCase();

const mapNewUser = (row = {}) => ({
  situacion: row['Situación'] ?? null,
  fecha_ingreso: row['FECHA DE INGRESO'] ?? null,
  rut: row['RUT'] == null ? null : formatRut(row['RUT']),
  nombre_apellidos: row['NOMBRE Y APELLIDOS'] ?? null,
  convenio_senda: row['CONVENIO SENDA'] ?? null,
  fecha_tentativa_ev_in: row['FECHA TENTATIVA EV IN'] ?? null,
  gestor: row['GESTOR'] ?? null,
  fecha_ev_integral: row['FECHA EV INTEGRAL'] ?? null,
  fecha_ultimo_pci: row['FECHA ÚLTIMO PCI'] ?? null,
  tiempo_pci: row['TIEMPO PCI'] ?? null,
  fecha_proximo_pci: row['FECHA PRÓXIMO PCI'] ?? null,
  tiempo_pci_1: row['TIEMPO PCI_1'] ?? null,
  fecha_proximo_pci_1: row['FECHA PRÓXIMO PCI_1'] ?? null,
  tiempo_pci_2: row['TIEMPO PCI_2'] ?? null,
  fecha_proximo_pci_2: row['FECHA PRÓXIMO PCI_2'] ?? null,
});

const editableColumns = Object.keys(NEW_USER_COLUMNS).filter((key) => key !== 'rut');
const dbColumnFor = (key) => `"${NEW_USER_COLUMNS[key]}"`;

const bodyToValues = (body = {}) =>
  editableColumns.map((key) => {
    const value = toCleanString(body[key]);
    return value === '' ? null : value;
  });

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM public."NewUsers" ORDER BY "RUT"');
    res.json(result.rows.map(mapNewUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:rut', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM public."NewUsers" WHERE regexp_replace("RUT", \'[^0-9Kk]\', \'\', \'g\') = $1',
      [normalizeRutKey(req.params.rut)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(mapNewUser(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const rut = formatRut(req.body?.rut);
    if (!rut) return res.status(400).json({ error: 'RUT es requerido' });

    const columns = editableColumns.map(dbColumnFor).join(', ');
    const placeholders = editableColumns.map((_, index) => `$${index + 2}`).join(', ');
    const values = bodyToValues(req.body);

    const result = await pool.query(
      `INSERT INTO public."NewUsers" ("RUT", ${columns}) VALUES ($1, ${placeholders}) RETURNING *`,
      [rut, ...values]
    );
    res.status(201).json(mapNewUser(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:rut', async (req, res) => {
  try {
    const rut = normalizeRutKey(req.params.rut);
    const sets = editableColumns.map((key, index) => `${dbColumnFor(key)} = $${index + 1}`).join(', ');
    const values = bodyToValues(req.body);
    const result = await pool.query(
      `UPDATE public."NewUsers" SET ${sets} WHERE regexp_replace("RUT", '[^0-9Kk]', '', 'g') = $${values.length + 1} RETURNING *`,
      [...values, rut]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(mapNewUser(result.rows[0]));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:rut', async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      'DELETE FROM fichas WHERE regexp_replace(rut, \'[^0-9Kk]\', \'\', \'g\') = $1',
      [normalizeRutKey(req.params.rut)]
    );
    const result = await client.query(
      'DELETE FROM public."NewUsers" WHERE regexp_replace("RUT", \'[^0-9Kk]\', \'\', \'g\') = $1 RETURNING *',
      [normalizeRutKey(req.params.rut)]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }
    await client.query('COMMIT');
    res.json({ mensaje: 'Usuario eliminado', usuario: mapNewUser(result.rows[0]) });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

export default router;
