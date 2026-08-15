import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

const mapNewUser = (row = {}) => ({
  situacion: row['Situación'] ?? null,
  fecha_ingreso: row['FECHA DE INGRESO'] ?? null,
  rut: row['RUT'] ?? null,
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

router.get('/', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM "NewUsers" ORDER BY "RUT"');
    res.json(result.rows.map(mapNewUser));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
