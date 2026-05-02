require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// 1. Configurare Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Configurare Google Drive
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CONFIG_JSON),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// 3. Configurare Multer (pentru fisiere temporare)
const upload = multer({ dest: '/tmp/' });

app.post('/upload-gallery', upload.array('photos'), async (req, res) => {
    try {
        const { username, password } = req.body;
        const files = req.files;

        // A. Verificăm dacă clientul există, dacă nu, îl creăm (Rezolvă eroarea 23505)
        let { data: client, error: clientError } = await supabase
            .from('clients')
            .select('*')
            .eq('username', username)
            .single();

        if (!client) {
            const { data: newClient, error: createError } = await supabase
                .from('clients')
                .insert({ username, password })
                .select()
                .single();
            if (createError) throw createError;
            client = newClient;
        }

        // B. Urcăm fiecare poză în Google Drive
        for (const file of files) {
            const fileMetadata = {
                name: file.originalname,
                parents: [process.env.GOOGLE_DRIVE_FOLDER_ID],
            };
            const media = {
                mimeType: file.mimetype,
                body: fs.createReadStream(file.path),
            };

            const gFile = await drive.files.create({
                resource: fileMetadata,
                media: media,
                fields: 'id',
                supportsAllDrives: true, // IMPORTANT pentru eroarea de Storage Quota
                keepRevisionForever: true
            });

            // C. Salvăm în Supabase
            await supabase.from('photos').insert({
                client_id: client.id,
                url: gFile.data.id,
                expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
            });

            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }

        res.status(200).send("Succes! Pozele au fost urcate.");
    } catch (error) {
        console.error("EROARE SERVER:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server activ pe portul ${PORT}`));
