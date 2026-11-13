// Render (aur kisi bhi Node host) par yt-dlp binary install karo.
// Render par sirf `npm install` chalta hai — system par yt-dlp nahi hota,
// is liye standalone binary GitHub releases se download karke ./bin/yt-dlp
// mein rakhte hain. server.js isi path ko use karta hai.
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp';
const DEST = path.join(__dirname, 'bin', 'yt-dlp');

function get(url, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'red-hole-backend' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (redirectsLeft <= 0) return reject(new Error('Too many redirects'));
        res.resume();
        return resolve(get(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Download failed, HTTP ' + res.statusCode));
      }
      resolve(res);
    }).on('error', reject);
  });
}

(async () => {
  fs.mkdirSync(path.dirname(DEST), { recursive: true });
  if (fs.existsSync(DEST)) {
    console.log('yt-dlp already present at ' + DEST);
    return;
  }
  console.log('Downloading yt-dlp binary...');
  const res = await get(URL, 5);
  await new Promise((resolve, reject) => {
    const out = fs.createWriteStream(DEST, { mode: 0o755 });
    res.pipe(out);
    out.on('finish', resolve);
    out.on('error', reject);
  });
  fs.chmodSync(DEST, 0o755);
  console.log('yt-dlp installed at ' + DEST);
})().catch((e) => {
  console.error('yt-dlp install failed:', e.message);
  process.exit(1);
});
