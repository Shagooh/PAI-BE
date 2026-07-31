import express from 'express';
import cors from 'cors';
import { initDB } from './db.js';
import usuariosRouter from './routes/usuarios.js';
import habilitacionesRouter from './routes/habilitaciones.js';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

app.use('/api/usuarios', usuariosRouter);
app.use('/api/habilitaciones', habilitacionesRouter);

app.listen(PORT, async () => {
  await initDB();
  console.log(`Servidor en http://localhost:${PORT}`);
});
