import { Router } from 'express';
import { pool } from '../db.js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const escapeHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

const summarizeTemplateImages = (html) => ({
  imgTags: (html.match(/<img\b/gi) || []).length,
  dataPngUris: (html.match(/data:image\/png;base64,/gi) || []).length,
  remainingImage1: (html.match(/images\/image1\.png/gi) || []).length,
  remainingImage2: (html.match(/images\/image2\.png/gi) || []).length,
});

const loadPciTemplateHtml = () => {
  const templateCandidates = [
    join(process.cwd(), 'PCI', 'PCI05062026prueba.html'),
    join(__dirname, '..', 'PCI', 'PCI05062026prueba.html'),
  ];

  const templatePath = templateCandidates.find((p) => existsSync(p));
  if (!templatePath) {
    return null;
  }

  let html = readFileSync(templatePath, 'utf-8');
  const templateRoot = dirname(templatePath);
  const img1Path = join(templateRoot, 'images', 'image1.png');
  const img2Path = join(templateRoot, 'images', 'image2.png');

  console.log('[TEMPLATE] path:', templatePath);
  console.log('[TEMPLATE] image1 exists:', existsSync(img1Path), '| image2 exists:', existsSync(img2Path));

  if (existsSync(img1Path)) {
    const img1Base64 = readFileSync(img1Path).toString('base64');
    html = html.replace(/(?:\.\/)?images\/image1\.png/gi, `data:image/png;base64,${img1Base64}`);
  }

  if (existsSync(img2Path)) {
    const img2Base64 = readFileSync(img2Path).toString('base64');
    html = html.replace(/(?:\.\/)?images\/image2\.png/gi, `data:image/png;base64,${img2Base64}`);
  }

  const summary = summarizeTemplateImages(html);
  console.log('[TEMPLATE] img summary after embed:', summary);

  return html;
};

const buildFallbackPageHtml = (nombre, edad, metaText, fechaStr) => `
  <div style="font-family:Arial,sans-serif; padding:32px; border:1px solid #ddd; border-radius:10px; margin-bottom:20px;">
    <h2 style="margin:0 0 12px; color:#1a237e;">Ficha de Usuario</h2>
    <p style="margin:0 0 8px;"><strong>Nombre:</strong> ${escapeHtml(nombre)}</p>
    <p style="margin:0 0 8px;"><strong>Edad:</strong> ${escapeHtml(String(edad))}</p>
    <p style="margin:0 0 8px;"><strong>Meta:</strong> ${metaText || '-'}</p>
    <p style="margin:16px 0 0; font-size:12px; color:#666;">Generado el ${escapeHtml(fechaStr)}</p>
  </div>
`;

router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT u.*, h.nombre AS decision_nombre, h.resultado AS habilitado
      FROM usuarios u
      LEFT JOIN habilitaciones h ON u.edad BETWEEN h.edad_min AND h.edad_max
    `;
    let params = [];
    if (search) {
      query += ` WHERE u.nombre ILIKE $1 OR u.apellido ILIKE $1`;
      params.push(`%${search}%`);
    }
    query += ` ORDER BY u.rut`;
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/preview', async (req, res) => {
  try {
    const { ids } = req.query;
    let userQuery = `
      SELECT u.*, h.nombre AS decision_nombre, h.resultado AS habilitado
      FROM usuarios u
      LEFT JOIN habilitaciones h ON u.edad BETWEEN h.edad_min AND h.edad_max
    `;
    let params = [];
    if (ids) {
      const idArr = ids.split(',').map(s => s.trim()).filter(Boolean);
      if (idArr.length > 0) {
        userQuery += ` WHERE u.rut = ANY($1::text[])`;
        params.push(idArr);
      }
    }
    userQuery += ' ORDER BY u.rut';
    const users = await pool.query(userQuery, params);

    const html = loadPciTemplateHtml();

    if (!html) {
      const now = new Date();
      const fechaStr = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
      const metaText = req.query.meta ? escapeHtml(req.query.meta) : '';
      const userPages = users.rows.map((u, idx) => {
        const sep = idx < users.rows.length - 1 ? ' style="page-break-after:always;"' : '';
        return `<div${sep}>${buildFallbackPageHtml(`${u.nombre} ${u.apellido}`, u.edad, metaText, fechaStr)}</div>`;
      }).join('\n');

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Preview usuarios</title></head><body>${userPages}</body></html>`);
      return;
    }

    console.log('[PREVIEW] template image summary:', summarizeTemplateImages(html));

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    const styleTag = html.match(/<style[^>]*>[\s\S]*?<\/style>/i)?.[0] || '';
    const headContent = html.match(/<head>([\s\S]*?)<\/head>/i)?.[1] || '';

    const now = new Date();
    const fechaStr = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    const metaText = req.query.meta ? escapeHtml(req.query.meta) : '';

    const processPage = (bodyContent, nombre, edad) => {
      let page = bodyContent;
      page = page.replace(/<p class="c0 c5"><span class="c7"><\/span><\/p>/g, '');
      page = page.replace(/(?:<p class="c0 c5"><span class="c1"><\/span><\/p>){6}/, '');
      page = page.replace(
        /<td class="c15" colspan="1" rowspan="1">/,
        `<td colspan="6" style="width:540pt;border-right-style:solid;padding:5pt;border-color:#000000;border-width:1pt;border-top-style:solid;border-left-style:solid;border-bottom-style:solid;vertical-align:top;"><p class="c0"><span class="c1">${metaText}</span></p>`
      );
      page = page.replace(
        /(<td class="c2" colspan="1" rowspan="1">)(<p class="c0 c5"><span class="c1"><\/span><\/p>)(<\/td>)/,
        `$1<p class="c0"><span class="c1">${nombre}</span></p>$3`
      );
      page = page.replace(
        /(<span class="c11">Edad:<\/span>)(<\/p>)/,
        `$1 ${edad}$2`
      );
      return page;
    };

    const userPages = users.rows.map((u, idx) => {
      const nombre = `${u.nombre} ${u.apellido}`;
      const edad = String(u.edad);
      const page = processPage(bodyContent, nombre, edad);
      const sep = idx < users.rows.length - 1 ? ' style="page-break-after:always;"' : '';
      return `<div${sep}>${page}<p style="text-align:center;margin-top:20px;font-size:9pt;color:#888;font-family:Candara;">Generado el ${fechaStr}</p></div>`;
    }).join('\n');

    console.log('[PREVIEW] Users:', users.rows.length);
    console.log('[PREVIEW] META cell in bodyContent:', /<td class="c15" colspan="1" rowspan="1">/.test(bodyContent));

    const fullHtml = `<!DOCTYPE html>
<html><head>${headContent}${styleTag}
<style>
  @media print { .no-print { display: none !important; } }
  body { display: flex; flex-direction: column; align-items: center; }
  table.c8 { width: 100%; border-collapse: collapse; }
  .c17 { max-width: 100%; width: 100%; padding: 20px 40px; margin: 0; box-sizing: border-box; }
  .c17 table { width: 100%; }
  .c2 { width: auto; }
  .c2.c6 { width: 1%; white-space: nowrap; padding: 4pt 6pt !important; }
</style>
</head>
<body class="c17 doc-content">
  <div class="no-print" style="text-align:center;margin-bottom:20px;">
    <button onclick="window.print()" style="padding:10px 30px;font-size:14px;background:#1a237e;color:#fff;border:none;border-radius:6px;cursor:pointer;">Imprimir</button>
  </div>
  ${userPages}
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fullHtml);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/:rut', async (req, res) => {
  try {
    const { rut } = req.params;
    const result = await pool.query('SELECT * FROM usuarios WHERE rut = $1', [rut]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { rut, nombre, apellido, edad } = req.body;
    if (!/^\d{1,2}\.\d{3}\.\d{3}-[\dKk]$/.test(rut)) {
      return res.status(400).json({ error: 'Formato de RUT inválido. Use xx.xxx.xxx-x' });
    }
    const result = await pool.query(
      'INSERT INTO usuarios (rut, nombre, apellido, edad) VALUES ($1, $2, $3, $4) RETURNING *',
      [rut, nombre, apellido, edad]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:rut', async (req, res) => {
  try {
    const { rut } = req.params;
    const { nombre, apellido, edad } = req.body;
    const result = await pool.query(
      'UPDATE usuarios SET nombre = $1, apellido = $2, edad = $3 WHERE rut = $4 RETURNING *',
      [nombre, apellido, edad, rut]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:rut', async (req, res) => {
  try {
    const { rut } = req.params;
    const result = await pool.query('DELETE FROM usuarios WHERE rut = $1 RETURNING *', [rut]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json({ mensaje: 'Usuario eliminado', usuario: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
