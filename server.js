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
app.use(express.static('public')); // Permite accesul la paginile HTML din folderul public

// 1. Configurare Supabase
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 2. Configurare Google Drive
const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_CONFIG_JSON),
    scopes: ['https://www.googleapis.com/auth/drive.file'],
});
const drive = google.drive({ version: 'v3', auth });

// 3. Configurare Multer pentru upload-uri temporare
const upload = multer({ dest: '/tmp/' }); // Render permite scrierea temporară în /tmp/

// RUTA ADMIN: Creare client și Upload poze
app.post('/upload-gallery', upload.array('photos'), async (req, res) => {
    try {
        const { username, password } = req.body;
        const files = req.files;

        // A. Creăm sau găsim clientul în Supabase
        const { data: client, error: clientError } = await supabase
            .from('clients')
            .upsert({ username, password }) // Folosim upsert pentru simplitate
            .select()
            .single();

        if (clientError) throw clientError;

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
                fields: 'id, webViewLink',
            });

            // C. Salvăm link-ul pozei în Supabase legat de client
            await supabase.from('photos').insert({
                client_id: client.id,
                url: gFile.data.id, // Salvăm doar ID-ul pentru a genera link-uri de vizualizare mai târziu
                expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
            });

            // Ștergem fișierul temporar
            fs.unlinkSync(file.path);
        }

        res.status(200).send("Galerie creată cu succes!");
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Serverul rulează pe portul ${PORT}`));
