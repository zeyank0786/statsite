import { describe, it, expect } from 'vitest';
import { sectionOfHref } from '@/lib/notifications';

/**
 * The section is the contract between the feed and the router: an event is
 * cleared when the page whose first path segment matches it is opened, so
 * these two derivations have to agree exactly.
 */
describe('sectionOfHref', () => {
  it('maps each feed link to the page that clears it', () => {
    expect(sectionOfHref('/suggestions')).toBe('suggestions');
    expect(sectionOfHref('/evidence')).toBe('evidence');
    expect(sectionOfHref('/achievements')).toBe('achievements');
    expect(sectionOfHref('/reminders')).toBe('reminders');
    expect(sectionOfHref('/ambitions')).toBe('ambitions');
  });

  it('collapses nested routes onto their parent page', () => {
    expect(sectionOfHref('/players/abc123')).toBe('players');
    expect(sectionOfHref('/commitments/xyz')).toBe('commitments');
  });

  it('ignores query strings and fragments', () => {
    expect(sectionOfHref('/messages?highlight=42')).toBe('messages');
    expect(sectionOfHref('/evidence#post-9')).toBe('evidence');
  });

  it('treats the dashboard as its own section', () => {
    expect(sectionOfHref('/')).toBe('home');
  });

  it('parks unlinked events in general, where only the bell clears them', () => {
    expect(sectionOfHref(undefined)).toBe('general');
    expect(sectionOfHref('')).toBe('general');
  });

  it('normalises case so the client and server watermarks match', () => {
    expect(sectionOfHref('/Suggestions')).toBe('suggestions');
  });
});
