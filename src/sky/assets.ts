// Baked image layers (see bake/). Keys: `plate_day` for the WebP, `plate_day_avif` for the AVIF.
const files = import.meta.glob('../assets/sky/*.{avif,webp}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;
export const assets: Record<string, string> = {};
for (const [path, url] of Object.entries(files)) {
  const [stem, ext] = path.split('/').pop()!.split('.');
  assets[ext === 'avif' ? stem + '_avif' : stem] = url;
}
