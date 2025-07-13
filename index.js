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

const SHEET_ID = process.env.SHEET_ID;

// 🟢 Obtener productos
app.get('/productos', async (req, res) => {
  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Hoja1!A2:D',
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
app.post('/productos', async (req, res) => {
  const { producto, fechaTexto } = req.body;

  const meses = {
    enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06',
    julio: '07', agosto: '08', septiembre: '09', octubre: '10', noviembre: '11', diciembre: '12'
  };

  // 🧠 Convertir "25 de julio" → "25/07/2025"
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
      spreadsheetId: SHEET_ID,
      range: 'Hoja1!A:D',
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
app.patch('/productos/estado', async (req, res) => {
  const { producto, estado } = req.body;

  if (!producto || !estado) {
    return res.status(400).send('Faltan datos');
  }

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    // Leer todas las filas
    const result = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: 'Hoja1!A2:D',
    });

    const filas = result.data.values || [];

    // Buscar la fila donde coincida el producto
    const filaIndex = filas.findIndex(row => row[0] === producto);

    if (filaIndex === -1) {
      return res.status(404).send('Producto no encontrado');
    }

    // La fila real (en Sheets) es +2 (por encabezado y base 1)
    const rango = `Hoja1!D${filaIndex + 2}`;

    // Actualizar el estado
    await sheets.spreadsheets.values.update({
      spreadsheetId: SHEET_ID,
      range: rango,
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
