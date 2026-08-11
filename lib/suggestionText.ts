/**
 * One account per suggestion.
 *
 * Suggestions used to carry TWO free-text fields — `reason` (required, step 4)
 * and `testimony` (the witness account, step 2). Only `reason` was ever written
 * to StatHistory, so whenever someone put the real explanation in the testimony
 * box and "see other relevant box" in the reason, the stat history recorded the
 * pointer and lost the substance.
 *
 * New suggestions write a single field. These helpers cover the rows already in
 * the database: `mergeAccount` folds the two into one for display, and
 * `isPointerText` identifies the placeholder reasons worth repairing in
 * StatHistory (see backfillPointerHistory).
 */

/**
 * Phrases that mean "the actual explanation is in the other field". Anchored
 * and applied only to short strings, because the risk here is asymmetric:
 * mistaking a real explanation for a pointer would overwrite genuine history.
 */
const POINTER_PATTERNS: RegExp[] = [
  /^see\s+(the\s+)?other(\s+(relevant\s+)?(box|field|section|one|part))?$/,
  /^see\s+(the\s+)?(relevant|info|other|attached|written)\s+\w*\s*(box|field|section|note)$/,
  /^see\s+(box\s+)?(above|below)$/,
  /^see\s+(my\s+|the\s+)?(testimony|witness(\s+account)?|statement|reason|description|note|comment|write[\s-]?up|details?|info(rmation)?|context|explanation)s?$/,
  /^(as|info|details?|context|explanation|reason)\s+(is\s+)?(above|below|in\s+the\s+other\s+\w+)$/,
  /^same\s+as\s+(above|below|other|the\s+other\s+\w+)$/,
  /^(read|check|refer\s+to)\s+(the\s+)?(other|above|below|first|second)\s*\w*$/,
  /^(other|above|below)\s+box$/,
  /^n\/?a$/,
  /^none$/,
  /^[-–—.·*\s]+$/,
];

/** Longest string still considered a possible pointer rather than content. */
const POINTER_MAX_LENGTH = 80;

/** Separator between a merged reason and testimony. */
const JOIN = '\n\n';

function normalise(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/["'“”‘’]/g, '')
    .replace(/[.!?,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * True when the text carries no explanation of its own — either a placeholder
 * pointing at the other field, or nothing at all.
 *
 * Empty counts as a pointer so the history backfill repairs blank reasons too;
 * mergeAccount checks for empty before it ever consults this.
 */
export function isPointerText(text: string | null | undefined): boolean {
  const raw = (text || '').trim();
  if (!raw) return true;
  if (raw.length > POINTER_MAX_LENGTH) return false;
  const norm = normalise(raw);
  if (!norm) return true;
  return POINTER_PATTERNS.some((pattern) => pattern.test(norm));
}

/**
 * Collapse a suggestion's reason + legacy testimony into the single account
 * that every surface now shows and that StatHistory records.
 *
 * A pointer on either side is dropped in favour of the side with the substance;
 * when both say something real they're joined, and a field already quoted
 * inside the other isn't repeated.
 */
export function mergeAccount(
  reason: string | null | undefined,
  testimony: string | null | undefined
): string {
  const left = (reason || '').trim();
  const right = (testimony || '').trim();

  if (!right) return left;
  if (!left) return right;

  // A pointer defers to the other side — but only when that side has real
  // substance. Two pointers mean nothing was ever written down, so keep the
  // canonical field rather than promoting an "n/a" over a "see other box".
  const leftIsPointer = isPointerText(left);
  const rightIsPointer = isPointerText(right);
  if (leftIsPointer && !rightIsPointer) return right;
  if (rightIsPointer && !leftIsPointer) return left;
  if (leftIsPointer && rightIsPointer) return left;

  const leftNorm = normalise(left);
  const rightNorm = normalise(right);
  if (leftNorm.includes(rightNorm)) return left;
  if (rightNorm.includes(leftNorm)) return right;

  return `${left}${JOIN}${right}`;
}
