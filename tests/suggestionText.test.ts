import { describe, it, expect } from 'vitest';
import { isPointerText, mergeAccount } from '@/lib/suggestionText';

describe('isPointerText', () => {
  it('catches the phrasings people actually typed', () => {
    const pointers = [
      'see other relevant box',
      'See other box',
      'see the other box.',
      'see other',
      'see above',
      'See below',
      'see box above',
      'see testimony',
      'see my witness account',
      'see description',
      'same as above',
      'info is below',
      'read the other',
      'check the other box',
      'other box',
      'N/A',
      'n/a',
      'none',
      '-',
      '...',
      '   ',
    ];
    for (const text of pointers) {
      expect(isPointerText(text), text).toBe(true);
    }
  });

  it('leaves real explanations alone', () => {
    const real = [
      'Ran a sub-20 5k on Saturday morning, tracked on Strava.',
      'He talked the whole group down when it kicked off outside the pub.',
      // Mentions another box but carries its own substance
      'See other box for the video, but the important part is he did it injured',
      'Above and beyond on the move — carried boxes for four hours straight',
      'None of us thought he would finish, and he did the whole thing anyway',
      'Saw it',
    ];
    for (const text of real) {
      expect(isPointerText(text), text).toBe(false);
    }
  });

  it('treats anything long as content regardless of wording', () => {
    expect(isPointerText(`see other box ${'x'.repeat(100)}`)).toBe(false);
  });

  it('treats nothing-at-all as a pointer so blank history gets repaired too', () => {
    expect(isPointerText(null)).toBe(true);
    expect(isPointerText(undefined)).toBe(true);
    expect(isPointerText('')).toBe(true);
  });
});

describe('mergeAccount', () => {
  it('keeps the substance when the reason is a pointer', () => {
    expect(mergeAccount('see other relevant box', 'He deadlifted 200kg at the gym on Tuesday.')).toBe(
      'He deadlifted 200kg at the gym on Tuesday.'
    );
  });

  it('keeps the substance when the testimony is a pointer', () => {
    expect(mergeAccount('He deadlifted 200kg on Tuesday.', 'see above')).toBe(
      'He deadlifted 200kg on Tuesday.'
    );
  });

  it('joins two real accounts rather than dropping either', () => {
    const merged = mergeAccount('Held the group together all weekend.', 'I watched him do it twice.');
    expect(merged).toContain('Held the group together all weekend.');
    expect(merged).toContain('I watched him do it twice.');
  });

  it('does not duplicate a field quoted inside the other', () => {
    const testimony = 'He ran the whole way back.';
    expect(mergeAccount(`${testimony} Nobody else did.`, testimony)).toBe(
      `${testimony} Nobody else did.`
    );
  });

  it('passes a single field straight through', () => {
    expect(mergeAccount('Just the reason.', null)).toBe('Just the reason.');
    expect(mergeAccount(null, 'Just the testimony.')).toBe('Just the testimony.');
    expect(mergeAccount('  padded  ', '')).toBe('padded');
  });

  it('returns an empty string when there is nothing at all', () => {
    expect(mergeAccount(null, null)).toBe('');
    expect(mergeAccount('', '   ')).toBe('');
  });

  it('is idempotent — merging an already-merged account changes nothing', () => {
    const once = mergeAccount('First half.', 'Second half.');
    expect(mergeAccount(once, null)).toBe(once);
    expect(mergeAccount(once, '')).toBe(once);
  });

  it('keeps both when both are pointers rather than inventing content', () => {
    // Nothing to recover — pick a side rather than returning empty.
    expect(mergeAccount('see other box', 'n/a')).toBe('see other box');
  });
});
