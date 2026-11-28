/**
 * Tiruan kecil api.github.com untuk pengujian.
 *
 * Dashboard admin menulis lewat GitHub Contents API. Supaya CRUD bisa diuji
 * tanpa menyentuh repositori sungguhan, semua panggilan `api.github.com`
 * dialihkan ke server lokal ini, yang menyimpan berkas di memori dan
 * menuliskannya ke folder sementara agar bisa diperiksa oleh uji.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export function jalankanStub({ berkas, folder }) {
  fs.mkdirSync(folder, { recursive: true });
  const simpan = {};
  for (const [nama, isi] of Object.entries(berkas)) simpan[nama] = isi;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      // Buang query string (?ref=main) sebelum mencari nama berkas —
      // kalau tidak, nama yang dicari menjadi "articles.json?ref=main".
      const jalur = req.url.split('?')[0];
      const nama = decodeURIComponent((jalur.match(/\/contents\/(.+)$/) || [])[1] || '').split('/').pop();

      if (req.method === 'GET' && nama) {
        if (!(nama in simpan)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          return res.end('{"message":"Not Found"}');
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({
          content: Buffer.from(simpan[nama]).toString('base64'),
          sha: `sha-${nama}`,
          name: nama,
        }));
      }

      if (req.method === 'PUT' && nama) {
        const d = JSON.parse(body || '{}');
        simpan[nama] = Buffer.from(d.content || '', 'base64').toString('utf8');
        fs.writeFileSync(path.join(folder, nama), simpan[nama]);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ content: { sha: `baru-${nama}` }, commit: { sha: 'c0ffee' } }));
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ default_branch: 'main', permissions: { push: true }, length: 0 }));
    });
  });

  return new Promise((selesai) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const asli = globalThis.fetch;
      globalThis.fetch = (u, o) =>
        String(u).startsWith('https://api.github.com')
          ? asli(String(u).replace('https://api.github.com', `http://127.0.0.1:${port}`), o)
          : asli(u, o);
      selesai({ port, tutup: () => { globalThis.fetch = asli; server.close(); } });
    });
  });
}
