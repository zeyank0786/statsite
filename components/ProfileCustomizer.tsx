'use client';

import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import Avatar from './Avatar';
import ImageCropper from './ImageCropper';
import { CheckIcon, TrashIcon, UploadIcon, AwardIcon, CropIcon } from './icons';
import {
  PICKABLE_COLORS,
  getUserColorHex,
  setCustomColor,
  upsertPlayerProfile,
} from '@/lib/userColors';
import { BIO_PLACES } from '@/lib/bioPlaces';
import {
  cloudinaryConfigured,
  fileTooLargeError,
  uploadToCloudinary,
  cldBanner,
  AVATAR_ASPECT,
  BANNER_ASPECT,
} from '@/lib/cloudinary';

/**
 * Profile customisation: accent colour, profile picture, banner, bio and an
 * earned title.
 *
 * All cosmetic, so it's self-served — this is the one part of a player's
 * identity that doesn't go through the crew. Images upload to Cloudinary the
 * moment they're picked (so the preview is real) and the crop editor opens
 * straight after, but nothing is persisted until Save, which sends only what
 * actually changed.
 */

const MAX_BIO = 160;

interface Profile {
  playerId: string;
  accentColor: string | null;
  avatarUrl: string | null;
  avatarPublicId: string | null;
  avatarCrop: string | null;
  bannerUrl: string | null;
  bannerPublicId: string | null;
  bannerCrop: string | null;
  bio: string | null;
  bioHiddenPlaces: string[];
  flairAchievementId: string | null;
  flairLabel: string | null;
}

type Draft = Omit<Profile, 'playerId'>;

const EMPTY: Draft = {
  accentColor: null,
  avatarUrl: null,
  avatarPublicId: null,
  avatarCrop: null,
  bannerUrl: null,
  bannerPublicId: null,
  bannerCrop: null,
  bio: null,
  bioHiddenPlaces: [],
  flairAchievementId: null,
  flairLabel: null,
};

/** bioHiddenPlaces is an array, so a plain !== would call every save dirty. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) {
    const x = Array.isArray(a) ? [...a].sort() : [];
    const y = Array.isArray(b) ? [...b].sort() : [];
    return x.length === y.length && x.every((v, i) => v === y[i]);
  }
  return a === b;
}

export default function ProfileCustomizer() {
  const { data: session, status } = useSession();
  const playerId = String((session?.user as { playerId?: string } | undefined)?.playerId || '');
  const playerName = String(
    (session?.user as { playerUsername?: string } | undefined)?.playerUsername ||
      session?.user?.name ||
      'You'
  );

  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [saved, setSaved] = useState<Draft>(EMPTY);
  const [takenColors, setTakenColors] = useState<string[]>([]);
  const [flairOptions, setFlairOptions] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'avatar' | 'banner' | 'saving' | null>(null);
  const [cropping, setCropping] = useState<'avatar' | 'banner' | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let cancelled = false;
    fetch('/api/profile')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const mine: Draft = data.me ? { ...EMPTY, ...data.me } : EMPTY;
        setDraft(mine);
        setSaved(mine);
        setTakenColors(Array.isArray(data.takenColors) ? data.takenColors : []);
        setFlairOptions(Array.isArray(data.flairOptions) ? data.flairOptions : []);
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [status]);

  const dirty = (Object.keys(EMPTY) as (keyof Draft)[]).some(
    (k) => !sameValue(draft[k], saved[k])
  );
  // The live preview has to reflect the draft, not the registry — the registry
  // still holds whatever was saved last.
  const previewHex = draft.accentColor || (playerId ? getUserColorHex(playerId) : '#22d3ee');

  const upload = async (kind: 'avatar' | 'banner', file: File) => {
    setError('');
    setSuccess('');
    const tooBig = fileTooLargeError(file);
    if (tooBig) {
      setError(tooBig);
      return;
    }
    if (!file.type.startsWith('image/')) {
      setError('Profile pictures and banners have to be images.');
      return;
    }
    setBusy(kind);
    try {
      const uploaded = await uploadToCloudinary(file);
      setDraft((prev) =>
        kind === 'avatar'
          ? { ...prev, avatarUrl: uploaded.url, avatarPublicId: uploaded.publicId, avatarCrop: null }
          : { ...prev, bannerUrl: uploaded.url, bannerPublicId: uploaded.publicId, bannerCrop: null }
      );
      // Straight into framing — an uncropped upload is just a centred guess.
      setCropping(kind);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(null);
    }
  };

  const toggleBioPlace = (key: string) =>
    setDraft((prev) => {
      const hidden = new Set(prev.bioHiddenPlaces);
      if (hidden.has(key)) hidden.delete(key);
      else hidden.add(key);
      return { ...prev, bioHiddenPlaces: [...hidden] };
    });

  const save = async () => {
    setBusy('saving');
    setError('');
    setSuccess('');
    try {
      // Send only what changed, so a colour tweak can't clobber a picture
      // someone else's tab saved a second earlier.
      const patch: Record<string, unknown> = {};
      for (const key of Object.keys(EMPTY) as (keyof Draft)[]) {
        if (!sameValue(draft[key], saved[key])) patch[key] = draft[key];
      }
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to save profile');
        return;
      }
      const next: Draft = { ...EMPTY, ...data.profile };
      setDraft(next);
      setSaved(next);
      // Update the app-wide registry immediately so the header avatar and every
      // chart repaint without a reload.
      if (playerId) {
        setCustomColor(playerId, next.accentColor);
        upsertPlayerProfile({ playerId, ...next });
      }
      setSuccess('Profile saved');
      setTimeout(() => setSuccess(''), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save profile');
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return <div className="glass card-shadow p-6 max-w-2xl mt-5 h-72 animate-pulse" />;
  }

  const takenSet = new Set(takenColors.map((c) => c.toLowerCase()));
  const croppingUrl = cropping === 'avatar' ? draft.avatarUrl : cropping === 'banner' ? draft.bannerUrl : null;

  return (
    <div className="glass card-shadow p-6 md:p-8 max-w-2xl mt-5 animate-rise">
      <h2 className="font-display text-lg font-bold text-white mb-1">Profile</h2>
      <p className="text-xs mb-5" style={{ color: 'var(--text-secondary)' }}>
        How you show up across the app — your colour follows you onto every chart, leaderboard and
        share card.
      </p>

      {/* Live preview */}
      <div
        className="rounded-2xl overflow-hidden border mb-6"
        style={{ borderColor: 'var(--surface-border)' }}
      >
        <div
          className="h-24 w-full"
          style={{
            background: draft.bannerUrl
              ? `url(${cldBanner(draft.bannerUrl, 900, draft.bannerCrop)}) center/cover`
              : `linear-gradient(120deg, ${previewHex}55, transparent 70%)`,
          }}
        />
        <div className="px-4 pb-4 -mt-8 flex items-end gap-3">
          <div style={{ boxShadow: `0 0 0 3px var(--background)`, borderRadius: 999 }}>
            <Avatar
              id={playerId}
              name={playerName}
              size={64}
              imageUrl={draft.avatarUrl}
              imageCrop={draft.avatarCrop}
            />
          </div>
          <div className="min-w-0 pb-1">
            <p className="font-display font-bold text-white leading-tight truncate">
              {playerName}
              {draft.flairLabel && (
                <span
                  className="ml-2 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full align-middle"
                  style={{ background: `${previewHex}22`, color: previewHex }}
                >
                  {draft.flairLabel}
                </span>
              )}
            </p>
            {draft.bio && (
              <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                {draft.bio}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Accent colour */}
      <label className="block text-sm font-semibold text-white mb-2">Accent colour</label>
      <div className="flex flex-wrap gap-2 mb-2">
        {PICKABLE_COLORS.map((hex) => {
          const taken = takenSet.has(hex) && draft.accentColor !== hex;
          const active = draft.accentColor === hex;
          return (
            <button
              key={hex}
              type="button"
              disabled={taken}
              onClick={() => setDraft((p) => ({ ...p, accentColor: hex }))}
              title={taken ? 'Already taken by someone else' : hex}
              className={`w-9 h-9 rounded-xl transition flex items-center justify-center ${
                taken ? 'opacity-25 cursor-not-allowed' : 'hover:scale-110'
              }`}
              style={{
                background: hex,
                boxShadow: active ? `0 0 0 2px var(--background), 0 0 0 4px ${hex}` : 'none',
              }}
            >
              {active && <CheckIcon size={16} className="text-black/70" />}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={() => setDraft((p) => ({ ...p, accentColor: null }))}
        className="text-xs underline mb-6 inline-block"
        style={{ color: 'var(--text-secondary)' }}
      >
        {draft.accentColor ? 'Use my automatic colour instead' : 'Using your automatic colour'}
      </button>

      {/* Images */}
      {!cloudinaryConfigured ? (
        <p className="text-xs mb-6" style={{ color: 'var(--accent-yellow)' }}>
          Image uploads need the Cloudinary env vars — colour, bio and title still work.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {(
            [
              ['avatar', 'Profile picture', draft.avatarUrl, avatarInput] as const,
              ['banner', 'Banner', draft.bannerUrl, bannerInput] as const,
            ]
          ).map(([kind, label, url, ref]) => (
            <div key={kind}>
              <label className="block text-sm font-semibold text-white mb-2">{label}</label>
              <input
                ref={ref}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(kind, file);
                  e.target.value = ''; // let the same file be re-picked
                }}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => ref.current?.click()}
                  disabled={busy === kind}
                  className="btn-ghost text-xs flex-1 justify-center"
                >
                  <UploadIcon size={13} />
                  {busy === kind ? 'Uploading…' : url ? 'Replace' : 'Upload'}
                </button>
                {url && (
                  <>
                    <button
                      type="button"
                      onClick={() => setCropping(kind)}
                      className="btn-ghost text-xs px-2.5"
                      title={`Reposition ${label.toLowerCase()}`}
                    >
                      <CropIcon size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraft((p) =>
                          kind === 'avatar'
                            ? { ...p, avatarUrl: null, avatarPublicId: null, avatarCrop: null }
                            : { ...p, bannerUrl: null, bannerPublicId: null, bannerCrop: null }
                        )
                      }
                      className="btn-ghost text-xs px-2.5"
                      title={`Remove ${label.toLowerCase()}`}
                    >
                      <TrashIcon size={13} />
                    </button>
                  </>
                )}
              </div>
              {url && (
                <p className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>
                  {(kind === 'avatar' ? draft.avatarCrop : draft.bannerCrop)
                    ? 'Cropped — tap the crop icon to re-frame.'
                    : 'Centred by default — tap the crop icon to frame it.'}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Bio */}
      <label className="block text-sm font-semibold text-white mb-2">Bio</label>
      <textarea
        value={draft.bio || ''}
        maxLength={MAX_BIO}
        rows={2}
        onChange={(e) => setDraft((p) => ({ ...p, bio: e.target.value }))}
        className="field resize-none text-sm"
        placeholder="One line about you — the crew sees this."
      />
      <p className="text-[11px] mt-1 mb-4 text-right" style={{ color: 'var(--text-secondary)' }}>
        {(draft.bio || '').length}/{MAX_BIO}
      </p>

      {/* Where the bio shows */}
      <p className="text-sm font-semibold text-white mb-1">Where your bio shows</p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-secondary)' }}>
        Everyone in the crew sees it wherever you switch it on. Your profile page always shows it.
      </p>
      <div className="rounded-xl border divide-y mb-6" style={{ borderColor: 'var(--surface-border)' }}>
        {BIO_PLACES.map((place) => {
          const on = !draft.bioHiddenPlaces.includes(place.key);
          return (
            <button
              key={place.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => toggleBioPlace(place.key)}
              disabled={!draft.bio}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition hover:bg-white/[0.03] disabled:opacity-40 disabled:hover:bg-transparent"
              style={{ borderColor: 'var(--surface-border)' }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium text-white">{place.label}</span>
                <span className="block text-[11px]" style={{ color: 'var(--text-secondary)' }}>
                  {place.hint}
                </span>
              </span>
              <span
                className="relative w-10 h-6 rounded-full shrink-0 transition"
                style={{ background: on ? previewHex : 'var(--surface-border-strong)' }}
              >
                <span
                  className="absolute top-1 w-4 h-4 rounded-full bg-white transition-all"
                  style={{ left: on ? 20 : 4 }}
                />
              </span>
            </button>
          );
        })}
      </div>

      {/* Title / flair */}
      <label className="block text-sm font-semibold text-white mb-1">Title</label>
      <p className="text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
        Wear an achievement next to your name. Only ones you&apos;ve actually earned.
      </p>
      {flairOptions.length === 0 ? (
        <p
          className="text-xs rounded-xl px-3.5 py-2.5 border flex items-center gap-2 mb-6"
          style={{ borderColor: 'var(--surface-border)', color: 'var(--text-secondary)' }}
        >
          <AwardIcon size={14} />
          No achievements earned yet — go get one.
        </p>
      ) : (
        <select
          value={draft.flairAchievementId || ''}
          onChange={(e) => {
            const id = e.target.value;
            const match = flairOptions.find((f) => f.id === id);
            setDraft((p) => ({
              ...p,
              flairAchievementId: id || null,
              flairLabel: match ? match.name : null,
            }));
          }}
          className="field mb-6"
        >
          <option value="">No title</option>
          {flairOptions.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}

      {error && (
        <div className="rounded-xl px-4 py-3 text-sm text-red-400 border border-red-500/40 bg-red-500/10 mb-4">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-xl px-4 py-3 text-sm text-emerald-400 border border-emerald-500/40 bg-emerald-500/10 mb-4 flex items-center gap-2">
          <CheckIcon size={15} /> {success}
        </div>
      )}

      <button
        type="button"
        onClick={save}
        disabled={!dirty || busy !== null}
        className="btn-gradient w-full py-3 disabled:opacity-50"
      >
        {busy === 'saving' ? 'Saving…' : dirty ? 'Save profile' : 'Saved'}
      </button>

      {cropping && croppingUrl && (
        <ImageCropper
          src={croppingUrl}
          aspect={cropping === 'avatar' ? AVATAR_ASPECT : BANNER_ASPECT}
          circle={cropping === 'avatar'}
          initialCrop={cropping === 'avatar' ? draft.avatarCrop : draft.bannerCrop}
          title={cropping === 'avatar' ? 'Frame your profile picture' : 'Frame your banner'}
          onCancel={() => setCropping(null)}
          onApply={(crop) => {
            setDraft((p) =>
              cropping === 'avatar' ? { ...p, avatarCrop: crop } : { ...p, bannerCrop: crop }
            );
            setCropping(null);
          }}
        />
      )}
    </div>
  );
}
