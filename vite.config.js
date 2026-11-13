// Dev server: /comfy/* is proxied to a local ComfyUI (http://127.0.0.1:8188) so the Rig Studio can auto-rig uploads
// (DWPose keypoints, BiRefNet cutout, Florence-2 prop masks) without any CORS setup on the ComfyUI side.
// /api/save/* keeps the campaign and the player's characters as files in saves/ (see vite.saves.js).
import { defineConfig } from 'vite';
import saves from './vite.saves.js';

const COMFY = 'http://127.0.0.1:8188';
const comfy = {
  target: COMFY, changeOrigin: true, rewrite: (p) => p.replace(/^\/comfy/, ''),
  // ComfyUI refuses POSTs whose Origin differs from its own host; the request is same-machine, so present it as such
  configure: (proxy) => proxy.on('proxyReq', (req) => { req.setHeader('origin', COMFY); req.removeHeader('referer'); }),
};

export default defineConfig({
  plugins: [saves()],
  // the save files change while the game runs; they must never trigger a reload
  server: { proxy: { '/comfy': comfy }, watch: { ignored: ['**/saves/**', '**/tools/_test/**', '**/tools/_gen/**'] } },
  preview: { proxy: { '/comfy': comfy } },
});
