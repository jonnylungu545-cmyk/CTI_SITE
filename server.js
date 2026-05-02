require('dotenv').config();
const express = require('express');
const multer = require('multer');
const { google } = require('googleapis');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configurare Google Drive cu OAuth2 (Cont Personal 100GB)
const oauth2Client = new google.auth.OAuth2(
    process.env.G_CLIENT_ID,
    process.env.G_CLIENT_SECRET
);

oauth2Client.setCredentials({
    refresh_token: process.env.G_REFRESH_TOKEN
});

const drive = google.drive({ version: 'v3', auth: oauth2Client });
const upload = multer({ dest: '/tmp/' });

app.post('/upload-gallery', upload.array('photos'), async (req, res) => {
    try {
        const { username, password } = req.body;
        const files = req.files;

        let { data: client } = await supabase.from('clients').select('*').eq('username', username).single();
        if (!client) {
            const { data: nC, error: e } = await supabase.from('clients').insert({ username, password }).select().single();
            if (e) throw e;
            client = nC;
        }

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
                requestBody: fileMetadata,
                media: media,
                fields: 'id'
            });

            await supabase.from('photos').insert({
                client_id: client.id,
                url: gFile.data.id,
                expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString()
            });

            if (fs.existsSync(file.path)) fs.unlinkSync(file.path);
        }

        res.status(200).send("Succes! Pozele sunt acum în spațiul tău de 100GB.");
    } catch (error) {
        console.error("EROARE:", error);
        res.status(500).json({ error: error.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server activ pe portul ${PORT}`));
