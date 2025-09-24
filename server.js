const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const rootDir = __dirname;
const publicFile = path.join(rootDir, 'Index.html');
const filesDir = path.join(rootDir, 'files');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.mp3': 'audio/mpeg',
  '.webmanifest': 'application/manifest+json',
};

const server = http.createServer(async (req, res) => {
  try {
    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (pathname === '/' || pathname === '/Index.html' || pathname === '/index.html') {
      const stream = fs.createReadStream(publicFile);
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      stream.pipe(res);
      return;
    }

    if (pathname === '/api/files') {
      const listing = await getFiles();
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.json'] });
      res.end(JSON.stringify(listing));
      return;
    }

    if (pathname === '/files' || pathname === '/files/') {
      const listing = await getFiles();
      res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
      res.end(renderDirectoryPage(listing));
      return;
    }

    if (pathname.startsWith('/files/')) {
      const relative = decodeURIComponent(pathname.replace('/files/', ''));
      if (!relative) {
        const listing = await getFiles();
        res.writeHead(200, { 'Content-Type': MIME_TYPES['.html'] });
        res.end(renderDirectoryPage(listing));
        return;
      }
      return serveStatic(path.join(filesDir, relative), req, res);
    }

    return serveStatic(path.join(rootDir, decodeURIComponent(pathname.slice(1))), req, res);
  } catch (error) {
    console.error(error);
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Interne serverfout');
  }
});

async function getFiles() {
  try {
    await fsp.mkdir(filesDir, { recursive: true });
    const entries = await fsp.readdir(filesDir, { withFileTypes: true });
    const allowed = new Set(['.mp3', '.mp4']);

    const items = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const ext = path.extname(entry.name).toLowerCase();
          if (!allowed.has(ext)) return null;
          const absolute = path.join(filesDir, entry.name);
          const stats = await fsp.stat(absolute);
          return {
            name: entry.name,
            url: `/files/${encodeURIComponent(entry.name)}`,
            size: stats.size,
            modified: stats.mtime,
            extension: ext.replace('.', ''),
            kind: ext === '.mp4' ? 'video' : 'audio',
          };
        })
    );

    return items.filter(Boolean).sort((a, b) => new Date(b.modified) - new Date(a.modified));
  } catch (error) {
    console.error('Kon de map files niet lezen:', error);
    return [];
  }
}

function serveStatic(absolutePath, req, res) {
  const resolved = path.normalize(absolutePath);
  if (!resolved.startsWith(rootDir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Geen toegang');
    return;
  }

  fs.stat(resolved, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Niet gevonden');
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(resolved).pipe(res);
  });
}

function renderDirectoryPage(listing) {
  const rows = listing
    .map(
      (item) =>
        `<li><a href="${item.url}">${escapeHtml(item.name)}</a> <small>(${item.extension.toUpperCase()} • ${item.size} bytes)</small></li>`
    )
    .join('');

  return `<!DOCTYPE html>
  <html lang="nl">
  <head>
    <meta charset="utf-8" />
    <title>Bestanden in files/</title>
    <style>
      body { font-family: system-ui, sans-serif; padding: 32px; background: #020617; color: #e2e8f0; }
      a { color: #3b82f6; }
    </style>
  </head>
  <body>
    <h1>Bestanden in files/</h1>
    <p>Sleep nieuwe MP3 of MP4 bestanden naar deze map en vernieuw de pagina.</p>
    <ul>${rows || '<li>Geen bestanden gevonden.</li>'}</ul>
    <p><a href="/">⬅︎ Terug naar de hub</a></p>
  </body>
  </html>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (match) => {
    switch (match) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      case "'":
        return '&#39;';
      default:
        return match;
    }
  });
}

const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Server draait op http://localhost:${port}`);
  console.log('Voeg MP3 of MP4 toe aan de map files/ en vernieuw de pagina.');
});
