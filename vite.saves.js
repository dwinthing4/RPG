// Saves on disk: the dev / preview server keeps the campaign, player-made characters and Rig Studio edits as JSON
// files in the project's saves/ folder, so progress outlives the browser tab, the browser's own storage and the
// server itself. The game still mirrors everything into browser storage and uses whichever copy is newer.
//   GET    /api/save/ping                  -> {ok, dir}
//   GET    /api/save/list/<dir>            -> ["id", ...]   (dir: characters | tweaks)
//   GET    /api/save/<name>                -> the file, or null when there is none yet
//   PUT    /api/save/<name>  (or POST)     -> write it (atomic; the campaign keeps rolling backups)
//   DELETE /api/save/<name>                -> remove it (moved into saves/trash/)
// <name> is "campaign" or "<dir>/<id>" with a plain id. ?slot=<name> keeps a separate set under saves/slots/<name>/
// (automated test browsers use one, so they never touch the player's own saves).
import fs from 'node:fs';
import path from 'node:path';

const DIRS = ['characters', 'tweaks'];
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MAX_BODY = 64 * 1024 * 1024;
const BACKUP_EVERY = 5 * 60 * 1000, BACKUPS_KEPT = 30;

export default function savesPlugin(root = process.cwd()) {
  const base = path.join(root, 'saves');
  const fileOf = (dir, name) => {
    if (name === 'campaign') return path.join(dir, 'campaign.json');
    const [d, id, extra] = name.split('/');
    if (extra !== undefined || !DIRS.includes(d) || !ID.test(id || '')) return null;
    return path.join(dir, d, id + '.json');
  };
  const send = (res, code, body, type = 'application/json') => {
    res.statusCode = code; res.setHeader('Content-Type', type); res.setHeader('Cache-Control', 'no-store'); res.end(body);
  };
  const readBody = (req) => new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
  const lastBackup = new Map();
  const backupCampaign = (dir, file) => {
    if (!fs.existsSync(file) || Date.now() - (lastBackup.get(dir) || 0) < BACKUP_EVERY) return;
    lastBackup.set(dir, Date.now());
    const bd = path.join(dir, 'backups'); fs.mkdirSync(bd, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    fs.copyFileSync(file, path.join(bd, `campaign-${stamp}.json`));
    const old = fs.readdirSync(bd).filter((f) => f.startsWith('campaign-')).sort();
    for (const f of old.slice(0, Math.max(0, old.length - BACKUPS_KEPT))) fs.rmSync(path.join(bd, f), { force: true });
  };
  const handler = async (req, res, next) => {
    const [rawPath, query] = (req.url || '').split('?');
    const url = decodeURIComponent(rawPath);
    if (!url.startsWith('/api/save/')) return next();
    const slot = new URLSearchParams(query || '').get('slot');
    if (slot && !/^[a-z0-9_-]{1,32}$/i.test(slot)) return send(res, 400, '{"error":"bad slot"}');
    const dir = slot ? path.join(base, 'slots', slot) : base;
    const name = url.slice('/api/save/'.length).replace(/\.json$/, '');
    try {
      if (name === 'ping') return send(res, 200, JSON.stringify({ ok: true, dir }));
      if (name.startsWith('list/')) {
        const d = name.slice(5); if (!DIRS.includes(d)) return send(res, 400, '{"error":"bad dir"}');
        const p = path.join(dir, d);
        const ids = fs.existsSync(p) ? fs.readdirSync(p).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).filter((i) => ID.test(i)) : [];
        return send(res, 200, JSON.stringify(ids));
      }
      const file = fileOf(dir, name);
      if (!file) return send(res, 400, '{"error":"bad name"}');
      if (req.method === 'GET') {
        if (!fs.existsSync(file)) return send(res, 200, 'null');   // nothing saved yet (not an error)
        return send(res, 200, fs.readFileSync(file, 'utf8'));
      }
      if (req.method === 'PUT' || req.method === 'POST') {
        const body = await readBody(req);
        JSON.parse(body);   // only well-formed saves are written
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (name === 'campaign') backupCampaign(dir, file);
        const tmp = file + '.tmp';
        fs.writeFileSync(tmp, body, 'utf8');
        if (fs.existsSync(file)) fs.copyFileSync(file, file + '.bak');
        fs.renameSync(tmp, file);
        return send(res, 200, '{"ok":true}');
      }
      if (req.method === 'DELETE') {
        if (fs.existsSync(file)) {
          const td = path.join(dir, 'trash'); fs.mkdirSync(td, { recursive: true });
          fs.renameSync(file, path.join(td, name.replace('/', '_') + '-' + Date.now() + '.json'));
        }
        return send(res, 200, '{"ok":true}');
      }
      return send(res, 405, '{"error":"method"}');
    } catch (e) {
      return send(res, 500, JSON.stringify({ error: String(e.message || e) }));
    }
  };
  return {
    name: 'ashen-saves',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}
