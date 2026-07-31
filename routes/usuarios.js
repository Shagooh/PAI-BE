import { Router } from 'express';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import htmlToDocx from 'html-to-docx';
import { pool } from '../db.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const router = Router();

const escapeHtml = (s) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#039;');

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

router.get('/excel', async (req, res) => {
  try {
    const { ids } = req.query;
    let query = `
      SELECT u.*, h.nombre AS decision_nombre, h.resultado AS habilitado
      FROM usuarios u
      LEFT JOIN habilitaciones h ON u.edad BETWEEN h.edad_min AND h.edad_max
    `;
    let params = [];
    if (ids) {
      const idArr = ids.split(',').map(s => s.trim()).filter(Boolean);
      if (idArr.length > 0) {
        query += ` WHERE u.rut = ANY($1::text[])`;
        params.push(idArr);
      }
    }
    query += ' ORDER BY u.rut';
    const users = await pool.query(query, params);
    const habRes = await pool.query('SELECT * FROM habilitaciones ORDER BY id');

    const workbook = new ExcelJS.Workbook();

    const sheet = workbook.addWorksheet('Usuarios');
    sheet.columns = [
      { header: 'RUT', key: 'rut', width: 14 },
      { header: 'Nombre', key: 'nombre', width: 20 },
      { header: 'Apellido', key: 'apellido', width: 20 },
      { header: 'Edad', key: 'edad', width: 8 },
      { header: 'Descripción', key: 'descripcion', width: 18 },
      { header: 'Habilitado', key: 'habilitado', width: 20 },
    ];
    users.rows.forEach((u) => sheet.addRow(u));
    sheet.getRow(1).font = { bold: true };

    const habSheet = workbook.addWorksheet('Habilitaciones');
    habSheet.columns = [
      { header: 'ID', key: 'id', width: 5 },
      { header: 'Nombre', key: 'nombre', width: 18 },
      { header: 'Edad Mín', key: 'edad_min', width: 10 },
      { header: 'Edad Máx', key: 'edad_max', width: 10 },
      { header: 'Resultado', key: 'resultado', width: 22 },
      { header: 'Descripción', key: 'descripcion', width: 50 },
    ];
    habRes.rows.forEach((h) => habSheet.addRow(h));
    habSheet.getRow(1).font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=usuarios.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/pdf', async (req, res) => {
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
    const habRes = await pool.query('SELECT * FROM habilitaciones ORDER BY id');

    const doc = new PDFDocument({ margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=usuarios.pdf');
    doc.pipe(res);

    const now = new Date();
    const fechaStr = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    const pageWidth = doc.page.width - 80;

    doc.roundedRect(40, 30, pageWidth, 105, 10).fill('#1a237e');
    doc.fill('#ffffff').fontSize(28).font('Helvetica-Bold').text('CRUD App', 60, 45);
    doc.fontSize(12).font('Helvetica').text('Sistema de Gesti\u00f3n de Usuarios', 60, 80);
    doc.fontSize(9).font('Helvetica-Oblique').text('Generado el ' + fechaStr, 60, 100);

    doc.circle(pageWidth + 20, 60, 22).fill('#ff6f00');
    doc.fill('#ffffff').fontSize(16).font('Helvetica-Bold').text('CA', pageWidth + 6, 48, { width: 30, align: 'center' });

    doc.moveDown(8);

    const startX = 40;
    let tableTop = doc.y;
    let colWidths = [80, 110, 110, 40, 100, 100];
    let headers = ['RUT', 'Nombre', 'Apellido', 'Edad', 'Descripci\u00f3n', 'Habilitado'];

    doc.rect(startX, tableTop, colWidths.reduce((a, b) => a + b), 22).fill('#1a237e');
    doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold');
    let x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 3, tableTop + 6, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });

    let y = tableTop + 22;
    doc.font('Helvetica').fontSize(8);

    users.rows.forEach((u, idx) => {
      if (y > 720) { doc.addPage(); y = 40; }

      const rowColor = idx % 2 === 0 ? '#f5f5f5' : '#ffffff';
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b), 16).fill(rowColor);

      x = startX;
      const values = [u.rut, u.nombre, u.apellido, String(u.edad), u.descripcion, u.habilitado];
      values.forEach((val, i) => {
        doc.fill('#333333').text(val, x + 3, y + 4, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });

      y += 16;
    });

    doc.rect(startX, y, colWidths.reduce((a, b) => a + b), 0).stroke('#cccccc');

    y += 25;
    if (y > 700) { doc.addPage(); y = 40; }

    doc.fontSize(14).font('Helvetica-Bold').fill('#1a237e').text('Tabla de Decisiones - Habilitaciones', startX, y);
    y = doc.y + 10;

    colWidths = [25, 100, 65, 65, 120, 180];
    headers = ['ID', 'Nombre', 'Edad Min', 'Edad Max', 'Resultado', 'Descripci\u00f3n'];

    const hTableTop = y;
    doc.rect(startX, hTableTop, colWidths.reduce((a, b) => a + b), 20).fill('#004d40');
    doc.fill('#ffffff').fontSize(9).font('Helvetica-Bold');
    x = startX;
    headers.forEach((h, i) => {
      doc.text(h, x + 3, hTableTop + 5, { width: colWidths[i] - 6, align: 'left' });
      x += colWidths[i];
    });

    y = hTableTop + 20;
    doc.font('Helvetica').fontSize(8);

    habRes.rows.forEach((h, idx) => {
      if (y > 720) { doc.addPage(); y = 40; }

      const rowColor = idx % 2 === 0 ? '#e0f2f1' : '#ffffff';
      doc.rect(startX, y, colWidths.reduce((a, b) => a + b), 16).fill(rowColor);

      x = startX;
      const vals = [String(h.id), h.nombre, String(h.edad_min), String(h.edad_max), h.resultado, h.descripcion];
      vals.forEach((val, i) => {
        doc.fill('#333333').text(val, x + 3, y + 4, { width: colWidths[i] - 6, align: 'left' });
        x += colWidths[i];
      });

      y += 16;
    });

    doc.rect(startX, y, colWidths.reduce((a, b) => a + b), 0).stroke('#004d40');

    y += 25;
    if (y > 700) { doc.addPage(); y = 40; }

    doc.fontSize(14).font('Helvetica-Bold').fill('#1a237e').text('Lorem Ipsum', startX, y);
    y = doc.y + 10;

    const loremCellW = 180;
    const loremCellH = 50;

    doc.rect(startX, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Lorem ipsum dolor sit', startX + 6, y + 6, { width: loremCellW - 12 });

    doc.rect(startX + loremCellW, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Amet consectetur', startX + loremCellW + 6, y + 6, { width: loremCellW - 12 });

    doc.rect(startX + loremCellW * 2, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Adipiscing elit', startX + loremCellW * 2 + 6, y + 6, { width: loremCellW - 12 });

    y += loremCellH;

    doc.rect(startX, y, loremCellW * 3, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua', startX + 6, y + 6, { width: loremCellW * 3 - 12, align: 'center' });

    y += loremCellH;

    doc.rect(startX, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Ut enim ad minim veniam', startX + 6, y + 6, { width: loremCellW - 12 });

    doc.rect(startX + loremCellW, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Quis nostrud exercitation', startX + loremCellW + 6, y + 6, { width: loremCellW - 12 });

    doc.rect(startX + loremCellW * 2, y, loremCellW, loremCellH).stroke('#bdbdbd');
    doc.fill('#333333').fontSize(8).font('Helvetica').text('Ullamco laboris nisi', startX + loremCellW * 2 + 6, y + 6, { width: loremCellW - 12 });

    doc.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/word', async (req, res) => {
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

    const templatePath = join(__dirname, '..', '..', 'PCI', 'PCI05062026prueba.html');
    const img1Path = join(__dirname, '..', '..', 'PCI', 'images', 'image1.png');
    const img2Path = join(__dirname, '..', '..', 'PCI', 'images', 'image2.png');

    let html = readFileSync(templatePath, 'utf-8');
    const img1Base64 = readFileSync(img1Path).toString('base64');
    const img2Base64 = readFileSync(img2Path).toString('base64');

    html = html.replace('images/image1.png', `data:image/png;base64,${img1Base64}`);
    html = html.replace('images/image2.png', `data:image/png;base64,${img2Base64}`);

    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const bodyContent = bodyMatch ? bodyMatch[1] : '';
    const styleTag = html.match(/<style[^>]*>[\s\S]*?<\/style>/i)?.[0] || '';

    const metaText = req.query.meta ? escapeHtml(req.query.meta) : '';
    const now = new Date();
    const fechaStr = now.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });

    const docxBuffer = await htmlToDocx(
      `<html><head>${styleTag}</head><body class="c17 doc-content">
        ${users.rows.map((u) => {
          const nombre = `${u.nombre} ${u.apellido}`;
          const edad = String(u.edad);
          let page = bodyContent
            .replace(/<p class="c0 c5"><span class="c7"><\/span><\/p>/g, '')
            .replace(/(?:<p class="c0 c5"><span class="c1"><\/span><\/p>){6}/, '')
            .replace(
              /<td class="c15" colspan="1" rowspan="1">/,
              `<td colspan="6" style="width:540pt;border-right-style:solid;padding:5pt;border-color:#000000;border-width:1pt;border-top-style:solid;border-left-style:solid;border-bottom-style:solid;vertical-align:top;"><p class="c0"><span class="c1">${metaText}</span></p>`
            )
            .replace(
              /(<td class="c2" colspan="1" rowspan="1">)(<p class="c0 c5"><span class="c1"><\/span><\/p>)(<\/td>)/,
              `$1<p class="c0"><span class="c1">${nombre}</span></p>$3`
            )
            .replace(
              /(<span class="c11">Edad:<\/span>)(<\/p>)/,
              `$1 ${edad}$2`
            );
          return `
          <div style="page-break-after:always;">
            ${page}
            <p style="text-align:center;margin-top:20px;font-size:9pt;color:#888;font-family:Candara;">
              Generado el ${fechaStr}
            </p>
          </div>`;
        }).join('\n')}
      </body></html>`,
      null,
      { table: { row: { cantSplit: true } } }
    );

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename=usuarios.docx');
    res.send(Buffer.from(docxBuffer));
  } catch (err) {
    console.error(err);
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

    const templatePath = join(__dirname, '..', '..', 'PCI', 'PCI05062026prueba.html');
    const img1Path = join(__dirname, '..', '..', 'PCI', 'images', 'image1.png');
    const img2Path = join(__dirname, '..', '..', 'PCI', 'images', 'image2.png');

    let html = readFileSync(templatePath, 'utf-8');
    const img1Base64 = readFileSync(img1Path).toString('base64');
    const img2Base64 = readFileSync(img2Path).toString('base64');

    html = html.replace('images/image1.png', `data:image/png;base64,${img1Base64}`);
    html = html.replace('images/image2.png', `data:image/png;base64,${img2Base64}`);

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
