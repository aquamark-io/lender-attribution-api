import express from 'express';
import multer from 'multer';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import supabase from './supabase.js';

const app = express();
const upload = multer();
const PORT = process.env.PORT || 3000;

app.post('/watermark', upload.single('file'), async (req, res) => {
  const apiKey = req.headers.authorization?.replace('Bearer ', '');
  if (apiKey !== process.env.API_KEY) {
    return res.status(401).send('Invalid API key');
  }

  const company = req.body.company || '';
  const userName = req.body.user_name || '';
  if (!company || !userName || !req.file) {
    return res.status(400).send('Missing required fields');
  }

  try {
    const pdfDoc = await PDFDocument.load(req.file.buffer);
    const pages = pdfDoc.getPages();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const now = new Date().toISOString().replace('T', ' ').slice(0, 16);

    const watermarkText = `INTERNAL USE ONLY\n${userName} — ${now}`;

    for (const page of pages) {
      const { width, height } = page.getSize();
      page.drawText(watermarkText, {
        x: width / 2 - 150,
        y: height / 2,
        size: 18,
        font,
        color: rgb(0.75, 0.75, 0.75),
        opacity: 0.4,
        lineHeight: 22,
      });
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.send(Buffer.from(pdfBytes));

    // 🔁 Supabase usage update
    const year = new Date().getFullYear();
    const month = new Date().getMonth() + 1;
    const pagesUsed = pages.length;

    const { data, error } = await supabase
      .from('lenders_attribution')
      .select('*')
      .eq('company_name', company)
      .eq('year', year)
      .eq('month', month);

    if (data && data.length > 0) {
      // Update existing row
      const row = data[0];
      await supabase.from('lenders_attribution').update({
        files_used: row.files_used + 1,
        pages_used: row.pages_used + pagesUsed,
      }).eq('id', row.id);
    } else {
      // Insert new row
      await supabase.from('lenders_attribution').insert([{
        company_name: company,
        year,
        month,
        files_used: 1,
        pages_used: pagesUsed,
      }]);
    }
  } catch (err) {
    console.error(err);
    res.status(500).send('Error processing PDF');
  }
});

app.listen(PORT, () => {
  console.log(`API running on port ${PORT}`);
});
