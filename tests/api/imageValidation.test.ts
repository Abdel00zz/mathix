import { describe, expect, it } from 'vitest';
import { MAX_IMAGE_EDGE, inspectImageDataUri } from '../../src/server/professor/imageValidation';

const toUri = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString('base64')}`;

function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write('IHDR', 12, 'ascii');
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

function jpeg(width: number, height: number): Buffer {
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF', 4, 'ascii');
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 3;
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

function webpExtended(width: number, height: number): Buffer {
  const b = Buffer.alloc(34);
  b.write('RIFF', 0, 'ascii');
  b.writeUInt32LE(26, 4);
  b.write('WEBP', 8, 'ascii');
  b.write('VP8X', 12, 'ascii');
  b.writeUInt32LE(10, 16);
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b;
}

function gif(width: number, height: number): Buffer {
  const b = Buffer.alloc(20);
  b.write('GIF89a', 0, 'ascii');
  b.writeUInt16LE(width, 6);
  b.writeUInt16LE(height, 8);
  return b;
}

describe('inspectImageDataUri', () => {
  it('lit les dimensions d\'un PNG, d\'un JPEG, d\'un WebP et d\'un GIF', () => {
    expect(inspectImageDataUri(toUri('image/png', png(640, 480)))).toMatchObject({ ok: true, mime: 'image/png', width: 640, height: 480 });
    expect(inspectImageDataUri(toUri('image/jpeg', jpeg(800, 600)))).toMatchObject({ ok: true, mime: 'image/jpeg', width: 800, height: 600 });
    expect(inspectImageDataUri(toUri('image/webp', webpExtended(1024, 768)))).toMatchObject({ ok: true, mime: 'image/webp', width: 1024, height: 768 });
    expect(inspectImageDataUri(toUri('image/gif', gif(120, 90)))).toMatchObject({ ok: true, mime: 'image/gif', width: 120, height: 90 });
  });

  it('accepte l\'alias historique image/jpg', () => {
    const result = inspectImageDataUri(toUri('image/jpg', jpeg(100, 50)));
    expect(result).toMatchObject({ ok: true, mime: 'image/jpeg' });
  });

  it('refuse un contenu qui ne correspond pas au type annoncé', () => {
    expect(inspectImageDataUri(toUri('image/jpeg', png(10, 10)))).toEqual({ ok: false, error: 'type_mismatch' });
    expect(inspectImageDataUri(toUri('image/png', gif(10, 10)))).toEqual({ ok: false, error: 'type_mismatch' });
  });

  it('refuse des octets qui ne sont pas une image, même avec un préfixe plausible', () => {
    const script = Buffer.from('<script>alert(1)</script> padding padding padding');
    expect(inspectImageDataUri(toUri('image/png', script))).toEqual({ ok: false, error: 'unreadable' });
  });

  it('refuse un type absent de la liste autorisée', () => {
    const result = inspectImageDataUri(toUri('image/webp', webpExtended(10, 10)), { allowed: ['image/png', 'image/jpeg'] });
    expect(result).toEqual({ ok: false, error: 'unsupported_type' });
  });

  it('refuse les URI invalides ou non textuelles', () => {
    expect(inspectImageDataUri('https://exemple.test/a.png')).toEqual({ ok: false, error: 'invalid_data_uri' });
    expect(inspectImageDataUri('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toEqual({ ok: false, error: 'invalid_data_uri' });
    expect(inspectImageDataUri(undefined)).toEqual({ ok: false, error: 'invalid_data_uri' });
    expect(inspectImageDataUri('data:image/png;base64,AAAA')).toEqual({ ok: false, error: 'invalid_data_uri' });
    expect(inspectImageDataUri('data:image/png;base64,@@@@@@@@@@@@@@@@@@@@')).toEqual({ ok: false, error: 'invalid_data_uri' });
  });

  it('borne le côté maximal', () => {
    expect(inspectImageDataUri(toUri('image/png', png(MAX_IMAGE_EDGE + 1, 10)))).toEqual({ ok: false, error: 'dimensions_too_large' });
    expect(inspectImageDataUri(toUri('image/png', png(MAX_IMAGE_EDGE, 10)))).toMatchObject({ ok: true });
  });

  it('refuse des dimensions nulles', () => {
    expect(inspectImageDataUri(toUri('image/png', png(0, 10)))).toEqual({ ok: false, error: 'unreadable' });
  });

  it('calcule le poids du binaire décodé', () => {
    const data = png(5, 5);
    const result = inspectImageDataUri(toUri('image/png', data));
    expect(result).toMatchObject({ ok: true, bytes: data.length });
  });
});
