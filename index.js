const express = require('express');
const { google } = require('googleapis');
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;

const auth = new google.auth.GoogleAuth({
  keyFile: 'credentials.json',
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const SHEET_IDS = {
  'Dpto90': '1tgM_Pcy6WBj4LjvMBlLKS2crI-wF3x8jNboInkU0gXY',
  'Dpto0192': '1_V5Iy48ZFrcKK0B296yfPkQEDZHpkpTA85i3Kvl1vtA',
  'Dpto95': '1Nh2_L6wdNKELnfQijfZ72TOfHoGfY9UTzHFaW8hNnMA',
  'Dpto13': '1jlSVWprHfmcJlTfLrxVKkzIRe9mj-bCfhQxItu7CBE8',
};

// Middleware para validar el departamento
function validarDpto(req, res, next) {
  const dpto = req.query.dpto || req.body.dpto;
  if (!SHEET_IDS[dpto]) {
    return res.status(400).send('Departamento inválido o faltante');
  }
  req.sheetId = SHEET_IDS[dpto];
  req.sheetName = dpto;
  next();
}

// -------------------- GET productos --------------------
app.get('/productos', validarDpto, async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    if (req.sheetName === 'Dpto13') {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: req.sheetId,
        range: `${req.sheetName}!A2:J`,
      });

      const valores = result.data.values || [];
      const productos = valores.map(([descripcion, codigo_barra, item, nro_lote, ubicacion, nro_bin, fecha_vencimiento, estado, fecha_agregado, notificado]) => ({
        descripcion,
        codigo_barra,
        item,
        nro_lote,
        ubicacion,
        nro_bin,
        fecha_vencimiento,
        estado,
        fecha_agregado,
        notificado
      }));

      return res.json(productos);
    }

    // Para otros dptos
    const range = req.sheetName === 'Dpto90' ? `${req.sheetName}!A2:C` : `${req.sheetName}!A2:D`;
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range,
    });

    const valores = result.data.values || [];
    const productos = valores.map(row => {
      if (req.sheetName === 'Dpto90') {
        const producto = row[0] || '';
        const fechaTexto = row[2] || ''; // columna C
        return { producto, fechaTexto, fechaOrdenable: '', estado: 'EN GÓNDOLA' };
      } else {
        const [producto, fechaTexto, fechaOrdenable, estado] = row;
        return { producto, fechaTexto, fechaOrdenable, estado };
      }
    });

    res.json(productos);
  } catch (err) {
    console.error('❌ Error GET productos:', err.message);
    res.status(500).send('Error interno');
  }
});

// -------------------- POST agregar producto --------------------
app.post('/productos', validarDpto, async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    if (req.sheetName === 'Dpto13') {
      const { descripcion, codigo_barra, item, nro_lote, ubicacion, nro_bin, fecha_vencimiento, estado, fecha_agregado, notificado } = req.body;

      await sheets.spreadsheets.values.append({
        spreadsheetId: req.sheetId,
        range: `${req.sheetName}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[
            descripcion,
            codigo_barra,
            item,
            nro_lote,
            ubicacion,
            nro_bin,
            fecha_vencimiento,
            estado || 'EN DEPOSITO',
            fecha_agregado || new Date().toISOString(),
            notificado === undefined ? false : notificado
          ]],
        },
      });

      return res.send('✅ Producto Dpto13 agregado');
    }

    const { producto, fechaTexto } = req.body;

    // Para Dpto90 la fecha va directo a la columna C
    const values = req.sheetName === 'Dpto90'
      ? [[producto, '', fechaTexto]] // A=producto, B vacía, C=fecha
      : [[producto, fechaTexto, '', 'EN GÓNDOLA']]; // otros dptos

    await sheets.spreadsheets.values.append({
      spreadsheetId: req.sheetId,
      range: req.sheetName === 'Dpto90' ? `${req.sheetName}!A:C` : `${req.sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values },
    });

    res.send('✅ Producto agregado');
  } catch (err) {
    console.error('❌ Error POST productos:', err.message);
    res.status(500).send('Error interno');
  }
});

// -------------------- PATCH cambiar estado --------------------
app.patch('/productos/estado', validarDpto, async (req, res) => {
  const { producto, estado } = req.body;

  if (!producto || !estado) {
    return res.status(400).send('Faltan datos');
  }

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    if (req.sheetName === 'Dpto13') {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: req.sheetId,
        range: `${req.sheetName}!A2:J`,
      });

      const filas = result.data.values || [];
      const filaIndex = filas.findIndex(row => row[1] === producto || row[0] === producto);

      if (filaIndex === -1) {
        return res.status(404).send('Producto no encontrado');
      }

      const rangeEstado = `${req.sheetName}!H${filaIndex + 2}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: req.sheetId,
        range: rangeEstado,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[estado]] },
      });

      return res.send('✅ Estado Dpto13 actualizado');
    }

    // Para otros dptos
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range: req.sheetName === 'Dpto90' ? `${req.sheetName}!A2:C` : `${req.sheetName}!A2:D`,
    });

    const filas = result.data.values || [];
    const filaIndex = filas.findIndex(row => row[0] === producto);

    if (filaIndex === -1) {
      return res.status(404).send('Producto no encontrado');
    }

    const rangeEstado = req.sheetName === 'Dpto90'
      ? `${req.sheetName}!D${filaIndex + 2}` // Dpto90: estado en D
      : `${req.sheetName}!D${filaIndex + 2}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: req.sheetId,
      range: rangeEstado,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[estado]] },
    });

    res.send('✅ Estado actualizado');
  } catch (err) {
    console.error('❌ Error PATCH estado:', err.message);
    res.status(500).send('Error interno');
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));


