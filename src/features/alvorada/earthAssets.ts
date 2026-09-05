/** Cloud-free NASA land imagery; only the albedo receives a desktop detail tier. */
export function getEarthTextureUrls(mobile: boolean) {
  return [
    `/alvorada/earth-surface-${mobile ? 2048 : 4096}.webp`,
    '/alvorada/earth-night-lights-2048.png',
    '/alvorada/earth-normal-2048.jpg',
    '/alvorada/earth-clouds-2048.webp',
  ];
}
