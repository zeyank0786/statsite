import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import {
  MAX_BIO_LENGTH,
  MAX_FLAIR_LABEL_LENGTH,
  getAllProfiles,
  getProfile,
  normaliseBioHiddenPlaces,
  normaliseCrop,
  normaliseHex,
  takenAccentColors,
  updateProfile,
  type ProfileUpdate,
} from '@/lib/profile';
import { getCrewStats } from '@/lib/crewStats';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

/**
 * Profile customisation — purely cosmetic, so it's self-served with no vote.
 *
 * GET   → every player's profile (the app-wide colour/avatar registry) plus,
 *         for the signed-in player, which colours are already taken and which
 *         achievements they've actually earned and can wear as a title.
 * PATCH → update your own profile. You can only ever edit yourself.
 */

async function getPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as { playerId?: string } | undefined)?.playerId;
  return playerId ? String(playerId) : null;
}

export async function GET() {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const profiles = await getAllProfiles();
    const taken = await takenAccentColors(playerId);

    // Only earned achievements are wearable — a title you haven't got would be
    // a lie on a board built entirely on evidence.
    let flairOptions: { id: string; name: string }[] = [];
    try {
      const { achievements } = await getCrewStats();
      flairOptions = (achievements[playerId] || [])
        .filter((a) => a.earned)
        .map((a) => ({ id: a.id, name: a.name }));
    } catch (e) {
      console.error('Failed to compute flair options (profile still loads):', e);
    }

    return NextResponse.json({
      profiles,
      me: profiles.find((p) => p.playerId === playerId) || null,
      takenColors: [...taken],
      flairOptions,
    });
  } catch (error: unknown) {
    console.error('Error loading profiles:', error);
    return NextResponse.json(errorPayload('Failed to load profiles', error), { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const playerId = await getPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const update: ProfileUpdate = {};

    if ('accentColor' in body) {
      if (body.accentColor === null || body.accentColor === '') {
        update.accentColor = null; // back to the auto-assigned colour
      } else {
        const hex = normaliseHex(body.accentColor);
        if (!hex) {
          return NextResponse.json({ error: 'That colour is not a valid hex code' }, { status: 400 });
        }
        // Two players sharing a colour makes them indistinguishable on every
        // chart and avatar in the app, so first claim wins.
        const taken = await takenAccentColors(playerId);
        if (taken.has(hex)) {
          return NextResponse.json(
            { error: 'Someone else already has that colour — pick another' },
            { status: 409 }
          );
        }
        update.accentColor = hex;
      }
    }

    for (const [urlKey, idKey, cropKey] of [
      ['avatarUrl', 'avatarPublicId', 'avatarCrop'],
      ['bannerUrl', 'bannerPublicId', 'bannerCrop'],
    ] as const) {
      if (urlKey in body) {
        const url = body[urlKey];
        if (url === null || url === '') {
          update[urlKey] = null;
          update[idKey] = null;
        } else if (typeof url !== 'string' || !/^https:\/\//i.test(url)) {
          return NextResponse.json({ error: `${urlKey} must be an https URL` }, { status: 400 });
        } else {
          update[urlKey] = url;
          update[idKey] = typeof body[idKey] === 'string' ? body[idKey] : null;
        }
        // The picture changed, so the old framing is meaningless — a crop taken
        // from a different photo would land somewhere arbitrary on this one. An
        // explicit crop in the same request overrides this below.
        update[cropKey] = null;
      }

      if (cropKey in body) {
        if (body[cropKey] === null || body[cropKey] === '') {
          update[cropKey] = null;
        } else {
          const crop = normaliseCrop(body[cropKey]);
          if (!crop) {
            return NextResponse.json(
              { error: `${cropKey} must be four fractions "x,y,w,h" between 0 and 1` },
              { status: 400 }
            );
          }
          update[cropKey] = crop;
        }
      }
    }

    if ('bioHiddenPlaces' in body) {
      update.bioHiddenPlaces = normaliseBioHiddenPlaces(body.bioHiddenPlaces);
    }

    if ('bio' in body) {
      const bio = typeof body.bio === 'string' ? body.bio.trim() : '';
      if (bio.length > MAX_BIO_LENGTH) {
        return NextResponse.json(
          { error: `Keep your bio under ${MAX_BIO_LENGTH} characters` },
          { status: 400 }
        );
      }
      update.bio = bio || null;
    }

    if ('flairAchievementId' in body) {
      if (!body.flairAchievementId) {
        update.flairAchievementId = null;
        update.flairLabel = null;
      } else {
        const id = String(body.flairAchievementId);
        // Verify it's actually earned rather than trusting the client — the
        // label is denormalised so rendering a name never costs a recompute.
        const { achievements } = await getCrewStats();
        const mine = achievements[playerId] || [];
        const match = mine.find((a) => a.id === id && a.earned);
        if (!match) {
          return NextResponse.json(
            { error: "You haven't earned that one yet" },
            { status: 403 }
          );
        }
        update.flairAchievementId = id;
        update.flairLabel = match.name.slice(0, MAX_FLAIR_LABEL_LENGTH);
      }
    }

    await updateProfile(playerId, update);
    return NextResponse.json({ success: true, profile: await getProfile(playerId) });
  } catch (error: unknown) {
    console.error('Error updating profile:', error);
    return NextResponse.json(errorPayload('Failed to update profile', error), { status: 500 });
  }
}
