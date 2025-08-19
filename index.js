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
  Dpto90:  '1tgM_Pcy6WBj4LjvMBlLKS2crI-wF3x8jNboInkU0gXY',
  Dpto0192:'1_V5Iy48ZFrcKK0B296yfPkQEDZHpkpTA85i3Kvl1vtA',
  Dpto95:  '1Nh2_L6wdNKELnfQijfZ72TOfHoGfY9UTzHFaW8hNnMA',
  Dpto13:  '1jlSVWprHfmcJlTfLrxVKkzIRe9mj-bCfhQxItu7CBE8',
};

function validarDpto(req, res, next) {
  const dpto = req.query.dpto || req.body.dpto;
  if (!SHEET_IDS[dpto]) return res.status(400).send('Departamento inválido o faltante');
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
      const dash = v => (!v || String(v).trim() === '' ? '-' : v);

      const productos = valores.map(([descripcion, codigo_barra, item, nro_lote, ubicacion, nro_bin, fecha_vencimiento, estado, fecha_agregado, notificado]) => ({
        descripcion: dash(descripcion),
        codigo_barra: dash(codigo_barra),
        item: dash(item),
        nro_lote: dash(nro_lote),
        ubicacion: dash(ubicacion),
        nro_bin: dash(nro_bin),
        fecha_vencimiento: dash(fecha_vencimiento),
        estado: dash(estado),
        fecha_agregado: dash(fecha_agregado),
        notificado: notificado === true || notificado === 'TRUE',
      }));

      return res.json(productos);
    }

    // Otros dptos (Dpto90 incluye fecha en C)
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A2:D`,
    });

    const valores = result.data.values || [];
    const productos = valores.map(([producto, fechaTexto, fechaOrdenable, estado]) => ({
      producto: producto || '-',
      fechaTexto: fechaTexto || '',
      fechaOrdenable: fechaOrdenable || '',
      estado: estado || '-',
    }));

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
      const dash = v => (!v || String(v).trim() === '' ? '-' : v);
      const {
        descripcion,
        codigo_barra,
        item,
        nro_lote,
        ubicacion,
        nro_bin,
        fecha_vencimiento,
        estado,
        fecha_agregado,
        notificado,
      } = req.body;

      // Requeridos
      if (!descripcion || !codigo_barra || !fecha_vencimiento) {
        return res.status(400).send('Faltan campos obligatorios en Dpto13');
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: req.sheetId,
        range: `${req.sheetName}!A:J`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [[
            descripcion,
            codigo_barra,
            dash(item),
            dash(nro_lote),
            dash(ubicacion),
            dash(nro_bin),
            fecha_vencimiento,                  // dd/MM/yyyy tal cual
            estado || 'EN DEPOSITO',
            fecha_agregado || new Date().toISOString(),
            notificado === undefined ? false : !!notificado,
          ]],
        },
      });

      return res.send('✅ Producto Dpto13 agregado');
    }

    // Otros dptos (mantiene Dpto90 con fecha en C)
    const { producto, fechaTexto } = req.body;

    if (!producto) return res.status(400).send('Falta producto');

    // Dpto90: si llega dd/MM/yyyy en fechaTexto -> a C, B queda vacío
    let fechaOrdenable = '';
    let fechaColB = fechaTexto || '';
    const ddmmyyyy = /^\d{2}\/\d{2}\/\d{4}$/;

    if (req.sheetName === 'Dpto90' && ddmmyyyy.test(fechaTexto || '')) {
      fechaOrdenable = fechaTexto;
      fechaColB = '';
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[producto, fechaColB, fechaOrdenable, 'EN GÓNDOLA']],
      },
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
  if (!producto || !estado) return res.status(400).send('Faltan datos');

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    if (req.sheetName === 'Dpto13') {
      const result = await sheets.spreadsheets.values.get({
        spreadsheetId: req.sheetId,
        range: `${req.sheetName}!A2:J`,
      });

      const filas = result.data.values || [];
      // Buscamos por código de barra primero, si no por descripción
      const filaIndex = filas.findIndex(row => row[1] === producto || row[0] === producto);
      if (filaIndex === -1) return res.status(404).send('Producto no encontrado');

      const rangeEstado = `${req.sheetName}!H${filaIndex + 2}`;
      await sheets.spreadsheets.values.update({
        spreadsheetId: req.sheetId,
        range: rangeEstado,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[estado]] },
      });

      return res.send('✅ Estado Dpto13 actualizado');
    }

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A2:D`,
    });

    const filas = result.data.values || [];
    const filaIndex = filas.findIndex(row => row[0] === producto);
    if (filaIndex === -1) return res.status(404).send('Producto no encontrado');

    const rangeEstado = `${req.sheetName}!D${filaIndex + 2}`;
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
