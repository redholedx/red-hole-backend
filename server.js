// Video Downloader — Oracle Free Backend
// Node.js + Express + yt-dlp
// Kaam: link lo -> yt-dlp se direct video URL nikalo -> user ko do.
// Video server par SAVE nahi hoti — sirf URL nikalte hain, is liye storage nahi bharta.

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

// yt-dlp binary: pehle repo ke andar ./bin/yt-dlp (Render postinstall se
// download hota hai), warna system PATH wala `yt-dlp` (local Ubuntu test).
const LOCAL_YTDLP = path.join(__dirname, 'bin', 'yt-dlp');
const YTDLP = fs.existsSync(LOCAL_YTDLP) ? LOCAL_YTDLP : 'yt-dlp';

const app = express();
const PORT = process.env.PORT || 3000;

// CORS: sirf Blogspot + localhost ko allow karo
// *.blogspot.com matlab tumhara Blogger blog (jaise savereel.blogspot.com)
const corsOptions = {
  origin: function (origin, callback) {
    // origin nahi hai (curl / server-to-server) to allow karo
    if (!origin) return callback(null, true);
    // localhost test ke liye allow
    if (origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
      return callback(null, true);
    }
    // *.blogspot.com allow
    try {
      const host = new URL(origin).hostname;
      if (host === 'blogspot.com' || host.endsWith('.blogspot.com')) {
        return callback(null, true);
      }
    } catch (e) {
      // galat origin — block karo
    }
    return callback(new Error('CORS blocked: is origin ki ijazat nahi'));
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));

// Health check — Oracle par test karne ke liye: http://IP:3000/health
app.get('/health', (req, res) => {
  res.json({ ok: true, service: 'video-downloader-backend', time: new Date().toISOString() });
});

// POST /api/download
// Body: { "url": "https://www.tiktok.com/...", "quality": "720", "audioOnly": false }
// quality: "1080" | "720" | "480" | "360"  (default 720)
// audioOnly true ho to MP3 ke liye best audio URL milega
app.post('/api/download', (req, res) => {
  const url = req.body && req.body.url ? String(req.body.url).trim() : '';
  const quality = req.body && req.body.quality ? String(req.body.quality) : '720';
  const audioOnly = req.body && req.body.audioOnly === true;

  if (!url || !/^https?:\/\//i.test(url)) {
    return res.status(400).json({ ok: false, error: 'Sahi link dalen — link http:// ya https:// se shuru hona chahiye.' });
  }

  // yt-dlp format: quality ke hisab se
  // -g = sirf direct URL do, file download mat karo (is liye server par kuch save nahi hota)
  // --no-playlist = playlist nahi, sirf ek video
  // -j = JSON info bhi lo (title ke liye)
  let format;
  if (audioOnly) {
    format = 'bestaudio/best';
  } else if (quality === '1080') {
    format = 'bestvideo[height<=1080]+bestaudio/best[height<=1080]/best';
  } else if (quality === '480') {
    format = 'bestvideo[height<=480]+bestaudio/best[height<=480]/best';
  } else if (quality === '360') {
    format = 'bestvideo[height<=360]+bestaudio/best[height<=360]/best';
  } else {
    format = 'bestvideo[height<=720]+bestaudio/best[height<=720]/best';
  }

  // YouTube datacenter IP ko aksar block karta hai ("Failed to extract any
  // player response"). Web client ki bajaye Android/iOS player client se
  // YouTubei API use hoti hai, jo aksar chal jata hai. YouTube links par
  // pehle android, phir ios, phir default client try karo; baaki sites par
  // sirf ek dafa.
  const isYouTube = /(^|\.)(youtube\.com|youtu\.be)$/i.test((() => { try { return new URL(url).hostname; } catch (e) { return ''; } })());
  const clients = isYouTube ? ['android', 'ios', null] : [null];

  function tryClient(i) {
    const client = clients[i];
    const args = ['-g', '-f', format, '--no-playlist', '--no-warnings'];
    if (client) args.push('--extractor-args', 'youtube:player_client=' + client);
    args.push(url);

    execFile(YTDLP, args, { timeout: 60000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        console.error('yt-dlp fail (client=' + (client || 'default') + '):', (stderr || err.message || '').split('\n').slice(-2).join(' '));
        if (i + 1 < clients.length) return tryClient(i + 1);
        return res.status(400).json({
          ok: false,
          error: 'Is link se video nahi mili. Link public hona chahiye — private Instagram / login wali video free par nahi khulti. Dobara try karen ya doosra link dalen.'
        });
      }
      // -g kabhi kabhi 2 URLs deta hai (video + audio alag). Pehli line lo.
      const directUrl = String(stdout).split('\n').map(s => s.trim()).filter(Boolean)[0];
      if (!directUrl) {
        if (i + 1 < clients.length) return tryClient(i + 1);
        return res.status(400).json({ ok: false, error: 'Video URL nahi mili. Dobara try karen.' });
      }
      res.json({ ok: true, url: directUrl, audioOnly: audioOnly, quality: quality });
    });
  }
  tryClient(0);
});

// Galat route par saaf jawab
app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Route nahi mila. /health ya /api/download use karen.' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Downloader backend chal raha hai — port ' + PORT);
  console.log('Health check: http://localhost:' + PORT + '/health');
});
