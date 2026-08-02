import { Router } from 'express';
import { pool } from '../db.js';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import JSZip from 'jszip';

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

const sanitizeText = (value) => escapeHtml(value == null ? '' : String(value));

const compactText = (value) => sanitizeText(value).replace(/\r?\n+/g, ' ').trim();

const toCellParagraph = (value) => `<p class="c0"><span class="c1">${compactText(value)}</span></p>`;

const createDecisionRowHtml = (decision = {}) => {
  const columns = [
    decision.dimension,
    decision.objetivo,
    decision.estrategia,
    decision.indicador,
    decision.plazo,
    decision.responsable,
    decision.evaluacion,
  ];

  const cells = columns
    .map((value) => `<td class="c2" colspan="1" rowspan="1">${toCellParagraph(value)}</td>`)
    .join('');

  return `<tr class="c3">${cells}</tr>`;
};

const replaceLabelValueCell = (html, label, value) => {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(
    `(<span class="c11">${escapedLabel}<\\/span><\\/p><\\/td><td class="c2" colspan="1" rowspan="1">)([\\s\\S]*?)(<\\/td>)`
  );
  return html.replace(regex, `$1${toCellParagraph(value)}$3`);
};

const replaceDecisionRows = (html, decisiones = []) => {
  const rowsHtml = (Array.isArray(decisiones) && decisiones.length > 0)
    ? decisiones.map((decision) => createDecisionRowHtml(decision)).join('')
    : createDecisionRowHtml({});

  return html.replace(
    /(<tr class="c3"><td class="c2 c6" colspan="1" rowspan="1"><p class="c0"><span class="c11">DIMENSI&Oacute;N<\/span><\/p><\/td>[\s\S]*?<span class="c11">EVALUACI&Oacute;N<\/span><\/p><\/td><\/tr>)[\s\S]*?(<\/table>)/,
    `$1${rowsHtml}$2`
  );
};

const buildUserPageFromTemplate = (templateBody, user = {}, meta = '', decisiones = []) => {
  const fullName = [user.nombre, user.apellido].filter(Boolean).join(' ').trim();

  let page = templateBody;
  page = page.replace(/<p class="c0 c5"><span class="c7"><\/span><\/p>/g, '');
  page = page.replace(
    /<td class="c15" colspan="1" rowspan="1">[\s\S]*?<\/td>/,
    `<td class="c15" colspan="1" rowspan="1">${toCellParagraph(meta)}</td>`
  );
  page = replaceLabelValueCell(page, 'Nombre:', fullName || user.nombre || '');
  page = replaceLabelValueCell(page, 'RUT:', user.rut || '');
  page = page.replace(
    /(<span class="c11">Edad:<\/span>)(<\/p>)/,
    `$1 ${compactText(user.edad)}$2`
  );
  page = replaceDecisionRows(page, decisiones);

  return page;
};

const xmlEscape = (value) => String(value == null ? '' : value)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const regexEscape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildDocxParagraphXml = (value) => {
  const text = xmlEscape(value).trim();
  return [
    '<w:p>',
    '<w:pPr><w:keepNext w:val="0"/><w:keepLines w:val="0"/><w:pageBreakBefore w:val="0"/><w:widowControl w:val="0"/><w:pBdr><w:top w:space="0" w:sz="0" w:val="nil"/><w:left w:space="0" w:sz="0" w:val="nil"/><w:bottom w:space="0" w:sz="0" w:val="nil"/><w:right w:space="0" w:sz="0" w:val="nil"/><w:between w:space="0" w:sz="0" w:val="nil"/></w:pBdr><w:shd w:fill="auto" w:val="clear"/><w:spacing w:after="0" w:before="0" w:line="276" w:lineRule="auto"/><w:ind w:left="0" w:right="0" w:firstLine="0"/><w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="Candara" w:cs="Candara" w:eastAsia="Candara" w:hAnsi="Candara"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr></w:pPr>',
    `<w:r><w:rPr><w:rFonts w:ascii="Candara" w:cs="Candara" w:eastAsia="Candara" w:hAnsi="Candara"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`,
    '</w:p>',
  ].join('');
};

const replaceDocxCellAfterLabel = (xml, label, value) => {
  const labelEscaped = regexEscape(label);
  const pattern = new RegExp(
    `(<w:t[^>]*>${labelEscaped}<\\/w:t>[\\s\\S]*?<\\/w:tc>\\s*<w:tc>\\s*<w:tcPr[\\s\\S]*?<\\/w:tcPr>)[\\s\\S]*?(<\\/w:tc>)`
  );
  return xml.replace(pattern, `$1${buildDocxParagraphXml(value)}$2`);
};

const replaceAgeInDocx = (xml, age) => xml.replace(
  /<w:t[^>]*>Edad:\s*[^<]*<\/w:t>/,
  `<w:t xml:space="preserve">Edad: ${xmlEscape(age)}</w:t>`
);

const replaceDecisionsInDocx = (xml, decisiones = []) => {
  const tablePattern = /(<w:tr>[\s\S]*?<w:t[^>]*>DIMENSIÓN<\/w:t>[\s\S]*?<w:t[^>]*>EVALUACIÓN<\/w:t>[\s\S]*?<\/w:tr>)([\s\S]*?)(<\/w:tbl>)/;
  const tableMatch = xml.match(tablePattern);
  if (!tableMatch) return xml;

  const headerRow = tableMatch[1];
  const existingRows = tableMatch[2];
  const firstRowTemplate = existingRows.match(/<w:tr>[\s\S]*?<\/w:tr>/)?.[0];

  if (!firstRowTemplate) return xml;

  const trPr = firstRowTemplate.match(/<w:trPr[\s\S]*?<\/w:trPr>/)?.[0] || '';
  const tcTemplates = firstRowTemplate.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || [];
  if (tcTemplates.length < 7) return xml;

  const normalized = Array.isArray(decisiones) ? decisiones : [];
  const rowsToRender = normalized.length > 0 ? normalized : [{}];

  const rowXml = rowsToRender.map((d) => {
    const values = [d.dimension, d.objetivo, d.estrategia, d.indicador, d.plazo, d.responsable, d.evaluacion];
    const renderedCells = tcTemplates.slice(0, 7).map((tc, idx) => tc.replace(
      /(<w:tc>\s*<w:tcPr[\s\S]*?<\/w:tcPr>)[\s\S]*?(<\/w:tc>)/,
      `$1${buildDocxParagraphXml(values[idx] || '')}$2`
    )).join('');
    return `<w:tr>${trPr}${renderedCells}</w:tr>`;
  }).join('');

  return xml.replace(tablePattern, `${headerRow}${rowXml}$3`);
};

const fillDocxPageXml = (pageXml, user = {}, meta = '', decisiones = []) => {
  const fullName = [user.nombre, user.apellido].filter(Boolean).join(' ').trim();

  let updated = pageXml;
  updated = replaceDocxCellAfterLabel(updated, 'Nombre:', fullName || user.nombre || '');
  updated = replaceDocxCellAfterLabel(updated, 'RUT:', user.rut || '');
  updated = replaceAgeInDocx(updated, user.edad || '');
  updated = replaceDocxCellAfterLabel(updated, 'META:', meta || '');
  updated = replaceDecisionsInDocx(updated, decisiones);

  return updated;
};

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

router.post('/word', async (req, res) => {
  try {
    const { ids = [], meta = '', usuarios = [], decisiones = [] } = req.body || {};

    const docxTemplateCandidates = [
      join(process.cwd(), 'Template_word_PCI.docx'),
      join(__dirname, '..', 'Template_word_PCI.docx'),
    ];
    const docxTemplatePath = docxTemplateCandidates.find((p) => existsSync(p));

    if (!docxTemplatePath) {
      return res.status(500).json({ error: 'No se encontró el template de Word (Template_word_PCI.docx) en el proyecto.' });
    }

    const requestedIds = Array.isArray(ids)
      ? ids.map((id) => String(id).trim()).filter(Boolean)
      : [];

    const payloadUsers = Array.isArray(usuarios) ? usuarios : [];
    const usersByRut = new Map(
      payloadUsers
        .filter((user) => user && user.rut)
        .map((user) => [String(user.rut), user])
    );

    const usersFromPayload = requestedIds.length > 0
      ? requestedIds.map((rut) => usersByRut.get(rut)).filter(Boolean)
      : payloadUsers;

    let usersForDocument = usersFromPayload;

    if (usersForDocument.length === 0 && requestedIds.length > 0) {
      const dbUsers = await pool.query(
        'SELECT rut, nombre, apellido, edad FROM usuarios WHERE rut = ANY($1::text[]) ORDER BY rut',
        [requestedIds]
      );
      usersForDocument = dbUsers.rows;
    }

    if (usersForDocument.length === 0) {
      return res.status(400).json({ error: 'No hay usuarios válidos para generar el documento.' });
    }

    const templateBuffer = readFileSync(docxTemplatePath);
    const zip = await JSZip.loadAsync(templateBuffer);
    const documentXmlOriginal = await zip.file('word/document.xml').async('string');

    const bodyMatch = documentXmlOriginal.match(/<w:body>([\s\S]*?)(<w:sectPr[\s\S]*?<\/w:sectPr>)\s*<\/w:body>/);
    if (!bodyMatch) {
      return res.status(500).json({ error: 'No se pudo interpretar el cuerpo del template DOCX.' });
    }

    const pageTemplateXml = bodyMatch[1];
    const sectionXml = bodyMatch[2];
    const pageBreakXml = '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';

    const pagesXml = usersForDocument
      .map((user) => fillDocxPageXml(pageTemplateXml, user, meta, decisiones))
      .join(pageBreakXml);

    const documentXmlUpdated = documentXmlOriginal.replace(
      /<w:body>[\s\S]*?<\/w:body>/,
      `<w:body>${pagesXml}${sectionXml}</w:body>`
    );

    zip.file('word/document.xml', documentXmlUpdated);
    const docxBuffer = await zip.generateAsync({ type: 'nodebuffer' });

    const safeDate = new Date().toISOString().slice(0, 10);
    const filename = `PCI-${safeDate}.docx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(Buffer.from(docxBuffer));
  } catch (err) {
    console.error('Error generando Word:', err);
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
