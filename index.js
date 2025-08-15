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

// 🟢 Obtener productos
app.get('/productos', validarDpto, async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A2:D`,
    });

    const valores = result.data.values || [];
    const productos = valores.map(([producto, fechaTexto, fechaOrdenable, estado]) => ({
      producto,
      fechaTexto,
      fechaOrdenable,
      estado,
    }));

    res.json(productos);
  } catch (err) {
    console.error('❌ Error:', err.message);
    res.status(500).send('Error interno');
  }
});

// 🟢 Agregar producto
app.post('/productos', validarDpto, async (req, res) => {
  const { producto, fechaTexto } = req.body;

  const meses = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };

  let fechaOrdenable = '';
  try {
    const [diaTexto, , mesTexto] = fechaTexto.toLowerCase().split(' ');
    const dia = diaTexto.padStart(2, '0');
    const mes = meses[mesTexto];
    const anio = new Date().getFullYear();

    if (!mes) throw new Error('Mes inválido');
    fechaOrdenable = `${dia}/${mes}/${anio}`;
  } catch (err) {
    console.warn('⚠️ Error al convertir fechaTexto:', err.message);
  }

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A:D`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[producto, fechaTexto, fechaOrdenable, 'EN GÓNDOLA']],
      },
    });

    res.send('✅ Producto agregado');
  } catch (err) {
    console.error('❌ Error al agregar producto:', err.message);
    res.status(500).send('Error interno');
  }
});

// 🟡 Cambiar estado de producto
app.patch('/productos/estado', validarDpto, async (req, res) => {
  const { producto, estado } = req.body;

  if (!producto || !estado) {
    return res.status(400).send('Faltan datos');
  }

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: req.sheetId,
      range: `${req.sheetName}!A2:D`,
    });

    const filas = result.data.values || [];
    const filaIndex = filas.findIndex(row => row[0] === producto);

    if (filaIndex === -1) {
      return res.status(404).send('Producto no encontrado');
    }

    const rangeEstado = `${req.sheetName}!D${filaIndex + 2}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId: req.sheetId,
      range: rangeEstado,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [[estado]] },
    });

    res.send('✅ Estado actualizado');
  } catch (err) {
    console.error('❌ Error al cambiar estado:', err.message);
    res.status(500).send('Error interno');
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));

