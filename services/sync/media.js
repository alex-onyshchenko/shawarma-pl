import { mkdir, writeFile, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import sharp from 'sharp';

const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function createMedia(directory) {
  let uploading = false;
  return {
    async upload(data) {
      if (uploading) throw Object.assign(new Error('Попереднє фото ще обробляється. Спробуйте ще раз.'), { status: 429 });
      if (typeof data !== 'string' || data.length > 7 * 1024 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) invalid('Оберіть JPEG, PNG або WebP до 5 МБ');
      const buffer = Buffer.from(data, 'base64');
      if (!buffer.length || buffer.length > 5 * 1024 * 1024) invalid('Фото має бути не більше 5 МБ');
      uploading = true;
      try {
        let converted;
        try {
          const image = sharp(buffer, { limitInputPixels: 40000000, animated: false });
          const metadata = await image.metadata();
          if (!['jpeg', 'png', 'webp'].includes(metadata.format)) invalid('Підтримуються лише JPEG, PNG та WebP');
          converted = await image.rotate().resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
        } catch { invalid('Не вдалося прочитати фото. Оберіть JPEG, PNG або WebP до 40 мегапікселів.'); }
        await mkdir(directory, { recursive: true });
        const filename = randomUUID() + '.webp';
        await writeFile(join(directory, filename), converted, { flag: 'wx', mode: 0o644 });
        return { imageUrl: '/media/' + filename };
      } finally { uploading = false; }
    },
    async serve(req, res, pathname) {
      if (!pathname.startsWith('/media/')) return false;
      const match = pathname.match(/^\/media\/([a-f0-9-]{36}\.webp)$/);
      if (!match || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404); res.end(); return true; }
      try {
        const filename = join(directory, match[1]);
        const file = await stat(filename);
        res.writeHead(200, { 'Content-Type': 'image/webp', 'Content-Length': file.size, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'Access-Control-Allow-Origin': '*' });
        if (req.method === 'HEAD') res.end();
        else createReadStream(filename).on('error', () => res.destroy()).pipe(res);
      } catch { res.writeHead(404); res.end(); }
      return true;
    },
  };
}
