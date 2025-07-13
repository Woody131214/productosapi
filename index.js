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
  const { producto, fechaTexto, fechaOrdenable } = req.body;

  try {
    const client = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: client });

    await sheets.spreadsheets.values.append({
      spreadsheetId: SHEET_ID,
      range: 'Hoja1!A:D',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [[producto, fechaTexto, fechaOrdenable, 'EN GONDOLA']],
      },
    });

    res.send('✅ Producto agregado');
  } catch (err) {
    console.error('❌ Error al agregar producto:', err.message);
    res.status(500).send('Error interno');
  }
});

app.listen(PORT, () => console.log(`🚀 Servidor escuchando en puerto ${PORT}`));
