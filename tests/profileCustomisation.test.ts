import { describe, it, expect } from 'vitest';
import {
  BANNER_ASPECT,
  cldBanner,
  cldThumb,
  parseCrop,
  serialiseCrop,
} from '@/lib/cloudinary';
import { normaliseCrop, normaliseBioHiddenPlaces, bioVisibleIn } from '@/lib/profile';
import { BIO_PLACE_KEYS } from '@/lib/bioPlaces';

const UPLOAD = 'https://res.cloudinary.com/demo/image/upload/v1/photo.jpg';

describe('crop parsing', () => {
  it('reads four fractions in order', () => {
    expect(parseCrop('0.1,0.2,0.5,0.5')).toEqual({ x: 0.1, y: 0.2, w: 0.5, h: 0.5 });
  });

  it('rejects anything that is not four finite numbers', () => {
    for (const bad of ['', 'nope', '0.1,0.2,0.5', '0.1,0.2,0.5,0.5,0.5', 'a,b,c,d', null, undefined]) {
      expect(parseCrop(bad as string | null)).toBeNull();
    }
  });

  it('treats a zero-size box as no crop rather than an empty image', () => {
    expect(parseCrop('0,0,0,0.5')).toBeNull();
    expect(parseCrop('0,0,0.5,0')).toBeNull();
  });

  it('keeps a full-frame crop just under 1, which Cloudinary reads as one pixel', () => {
    expect(parseCrop('0,0,1,1')).toEqual({ x: 0, y: 0, w: 0.9999, h: 0.9999 });
  });

  it('round-trips through serialisation', () => {
    const box = { x: 0.125, y: 0.0625, w: 0.5, h: 0.5 };
    expect(parseCrop(serialiseCrop(box))).toEqual(box);
  });

  it('rounds off floating-point dust when serialising', () => {
    expect(serialiseCrop({ x: 0.1234567, y: 0, w: 0.5, h: 0.5 })).toBe('0.1235,0,0.5,0.5');
  });
});

describe('crop delivery URLs', () => {
  it('applies the crop before the fill, so framing wins over squaring off', () => {
    const url = cldThumb(UPLOAD, 96, '0.1,0.2,0.5,0.5');
    expect(url).toContain('/upload/c_crop,x_0.1000,y_0.2000,w_0.5000,h_0.5000/c_fill,w_96,h_96,');
  });

  it('leaves uncropped images exactly as they were', () => {
    expect(cldThumb(UPLOAD, 96)).toBe(cldThumb(UPLOAD, 96, null));
    expect(cldThumb(UPLOAD, 96)).toContain('/upload/c_fill,w_96,h_96,');
  });

  it('ignores a malformed crop instead of putting it in the URL', () => {
    expect(cldThumb(UPLOAD, 96, 'javascript:alert(1)')).toBe(cldThumb(UPLOAD, 96));
  });

  it('sizes banners to the shared aspect', () => {
    expect(cldBanner(UPLOAD, 1200)).toContain(`c_fill,w_1200,h_${1200 / BANNER_ASPECT},`);
  });

  it('is a no-op on URLs that are not Cloudinary uploads', () => {
    const foreign = 'https://example.com/photo.jpg';
    expect(cldThumb(foreign, 96, '0,0,0.5,0.5')).toBe(foreign);
  });
});

describe('crop validation at the API boundary', () => {
  it('accepts four fractions in range', () => {
    expect(normaliseCrop('0.1,0.2,0.5,0.5')).toBe('0.1,0.2,0.5,0.5');
  });

  it('refuses values outside 0–1, so a crop cannot address outside the image', () => {
    expect(normaliseCrop('-0.1,0,0.5,0.5')).toBeNull();
    expect(normaliseCrop('0,0,1.5,0.5')).toBeNull();
    expect(normaliseCrop('1.2,0,0.5,0.5')).toBeNull();
  });

  it('refuses anything that could smuggle text into a delivery URL', () => {
    expect(normaliseCrop('0,0,0.5,0.5/f_auto/l_text:hi')).toBeNull();
    expect(normaliseCrop({ x: 0 })).toBeNull();
    expect(normaliseCrop(null)).toBeNull();
  });

  it('rounds to four decimals so stored values stay short', () => {
    expect(normaliseCrop('0.123456789,0,0.5,0.5')).toBe('0.1235,0,0.5,0.5');
  });
});

describe('bio placement toggles', () => {
  it('keeps only known place keys', () => {
    expect(normaliseBioHiddenPlaces(['leaderboard', 'not-a-place'])).toBe('leaderboard');
  });

  it('accepts a CSV as well as an array', () => {
    expect(normaliseBioHiddenPlaces('leaderboard,feeds')).toBe('leaderboard,feeds');
  });

  it('de-duplicates', () => {
    expect(normaliseBioHiddenPlaces(['feeds', 'feeds'])).toBe('feeds');
  });

  it('stores nothing when the bio shows everywhere', () => {
    expect(normaliseBioHiddenPlaces([])).toBeNull();
    expect(normaliseBioHiddenPlaces(undefined)).toBeNull();
    expect(normaliseBioHiddenPlaces(['not-a-place'])).toBeNull();
  });

  it('survives a full round trip of every place switched off', () => {
    expect(normaliseBioHiddenPlaces(BIO_PLACE_KEYS)).toBe(BIO_PLACE_KEYS.join(','));
  });
});

describe('bioVisibleIn', () => {
  it('shows a bio in places the player has not switched off', () => {
    expect(bioVisibleIn({ bio: 'hello', bioHiddenPlaces: ['feeds'] }, 'leaderboard')).toBe(true);
  });

  it('hides it where they have', () => {
    expect(bioVisibleIn({ bio: 'hello', bioHiddenPlaces: ['feeds'] }, 'feeds')).toBe(false);
  });

  it('defaults to visible everywhere when nothing is switched off', () => {
    for (const place of BIO_PLACE_KEYS) {
      expect(bioVisibleIn({ bio: 'hello', bioHiddenPlaces: [] }, place as 'feeds')).toBe(true);
    }
  });

  it('never shows an empty bio, whatever the toggles say', () => {
    expect(bioVisibleIn({ bio: null, bioHiddenPlaces: [] }, 'leaderboard')).toBe(false);
    expect(bioVisibleIn({ bio: '', bioHiddenPlaces: [] }, 'leaderboard')).toBe(false);
  });
});
