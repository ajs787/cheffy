import { checkImage, imageInfo } from '../../supabase/functions/_shared/imageInfo';

const pngHeader = (w: number, h: number, colorType = 6) => {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[24] = 8;
  b[25] = colorType;
  return b;
};

const jpegHeader = (w: number, h: number) =>
  new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    ...new Array(14).fill(0),
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    h >> 8,
    h & 0xff,
    w >> 8,
    w & 0xff,
    0x03,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);

const webpVp8x = (w: number, h: number, flags: number) => {
  const b = new Uint8Array(30);
  b.set(
    [...'RIFF'].map((c) => c.charCodeAt(0)),
    0,
  );
  b.set(
    [...'WEBP'].map((c) => c.charCodeAt(0)),
    8,
  );
  b.set(
    [...'VP8X'].map((c) => c.charCodeAt(0)),
    12,
  );
  b[20] = flags;
  const ww = w - 1;
  const hh = h - 1;
  b.set([ww & 0xff, (ww >> 8) & 0xff, (ww >> 16) & 0xff, hh & 0xff, (hh >> 8) & 0xff, (hh >> 16) & 0xff], 24);
  return b;
};

describe('imageInfo', () => {
  it('reads PNG, JPEG and WebP from their bytes', () => {
    expect(imageInfo(pngHeader(512, 400))).toEqual({
      mime: 'image/png',
      width: 512,
      height: 400,
      mayHaveAlpha: true,
    });
    expect(imageInfo(jpegHeader(1080, 1350))).toEqual({
      mime: 'image/jpeg',
      width: 1080,
      height: 1350,
      mayHaveAlpha: false,
    });
    expect(imageInfo(webpVp8x(300, 200, 0x10))).toEqual({
      mime: 'image/webp',
      width: 300,
      height: 200,
      mayHaveAlpha: true,
    });
  });

  it('refuses anything else, whatever it claims to be', () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(
      imageInfo(enc('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')),
    ).toBeNull();
    expect(imageInfo(enc('<html><body>hi</body></html>'))).toBeNull();
    expect(imageInfo(enc('GIF89a......................'))).toBeNull();
    expect(imageInfo(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
    expect(imageInfo(webpVp8x(300, 200, 0x02))).toBeNull(); // animated
    expect(imageInfo(pngHeader(0, 10))).toBeNull();
  });
});

describe('checkImage', () => {
  it('enforces size, dimensions and sticker transparency formats', () => {
    const png = imageInfo(pngHeader(512, 512));
    const jpg = imageInfo(jpegHeader(1080, 1080));
    expect(checkImage(png, 100_000, 'sticker', 'full')).toBeNull();
    expect(checkImage(jpg, 100_000, 'sticker', 'full')).toMatch(/PNG or WebP/);
    expect(checkImage(jpg, 4 * 1024 * 1024, 'photo', 'full')).toMatch(/too large/);
    expect(checkImage(imageInfo(jpegHeader(4000, 3000)), 1000, 'photo', 'full')).toMatch(/image too large/);
    expect(checkImage(jpg, 1000, 'photo', 'thumb')).toMatch(/image too large/);
    expect(checkImage(null, 10, 'photo', 'full')).toMatch(/not a JPEG/);
  });
});
