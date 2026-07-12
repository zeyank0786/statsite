import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { query, queryOne, queryAll } from '@/lib/db';
import { destroyCloudinaryAsset } from '@/lib/cloudinaryServer';
import { featureLockMessage } from '@/lib/featureLocks';
import { v4 as uuid } from 'uuid';

export const dynamic = 'force-dynamic';

async function getSessionPlayerId(): Promise<string | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  return playerId ? String(playerId) : null;
}

/** GET all evidence posts with poster, categories and suggestion usage count. */
export async function GET() {
  const playerId = await getSessionPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const posts = await queryAll(
      `SELECT e.id, e.playerId, e.mediaUrl, e.mediaType, e.cloudinaryPublicId,
              e.caption, e.captionHidden, e.createdAt, e.updatedAt,
              p.username as playerName, p.active as playerActive,
              (SELECT COUNT(*) FROM SuggestionEvidence se WHERE se.evidenceId = e.id) as suggestionCount
       FROM Evidence e
       JOIN Player p ON e.playerId = p.id
       ORDER BY e.createdAt DESC`
    );

    const tags = await queryAll(
      `SELECT ec.evidenceId, c.id as categoryId, c.code, c.label
       FROM EvidenceCategory ec
       JOIN Category c ON ec.categoryId = c.id`
    );
    const tagsByEvidence = new Map<string, any[]>();
    for (const tag of tags as any[]) {
      const key = String(tag.evidenceId);
      if (!tagsByEvidence.has(key)) tagsByEvidence.set(key, []);
      tagsByEvidence.get(key)!.push({
        categoryId: String(tag.categoryId),
        code: String(tag.code),
        label: String(tag.label),
      });
    }

    return NextResponse.json(
      (posts as any[]).map((post) => ({
        id: String(post.id),
        playerId: String(post.playerId),
        playerName: String(post.playerName),
        playerActive: Boolean(Number(post.playerActive)),
        mediaUrl: post.mediaUrl || null,
        mediaType: post.mediaType || null,
        caption: post.caption || null,
        captionHidden: Boolean(Number(post.captionHidden)),
        categories: tagsByEvidence.get(String(post.id)) || [],
        suggestionCount: Number(post.suggestionCount),
        isOwn: String(post.playerId) === playerId,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      }))
    );
  } catch (error: any) {
    console.error('Error fetching evidence:', error);
    return NextResponse.json({ error: 'Failed to fetch evidence', details: error.message }, { status: 500 });
  }
}

/** POST: create an evidence post. Only about yourself — poster is the subject. */
export async function POST(request: Request) {
  const playerId = await getSessionPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(playerId, 'evidence');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { mediaUrl, mediaType, cloudinaryPublicId, caption, categoryIds } = await request.json();

    if (!Array.isArray(categoryIds) || categoryIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one category' }, { status: 400 });
    }
    const uniqueCatIds = [...new Set(categoryIds as string[])].filter(Boolean);
    if (uniqueCatIds.length === 0) {
      return NextResponse.json({ error: 'Pick at least one category' }, { status: 400 });
    }
    const catPlaceholders = uniqueCatIds.map(() => '?').join(',');
    const foundCats = await queryAll(
      `SELECT id FROM Category WHERE id IN (${catPlaceholders})`,
      uniqueCatIds
    );
    if (foundCats.length !== uniqueCatIds.length) {
      return NextResponse.json({ error: 'One or more categories were not found' }, { status: 400 });
    }
    if (!mediaUrl && !caption?.trim()) {
      return NextResponse.json({ error: 'Add media or a caption' }, { status: 400 });
    }
    if (mediaType && !['image', 'video'].includes(mediaType)) {
      return NextResponse.json({ error: 'mediaType must be image or video' }, { status: 400 });
    }

    const player = await queryOne('SELECT active FROM Player WHERE id = ?', [playerId]);
    if (!player || !Number(player.active)) {
      return NextResponse.json({ error: 'Only active players can post evidence' }, { status: 403 });
    }

    const id = uuid();
    const now = new Date().toISOString();
    await query(
      `INSERT INTO Evidence (id, playerId, mediaUrl, mediaType, cloudinaryPublicId, caption, captionHidden, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, playerId, mediaUrl || null, mediaType || null, cloudinaryPublicId || null, caption?.trim() || null, now, now]
    );

    for (const categoryId of uniqueCatIds) {
      await query('INSERT INTO EvidenceCategory (evidenceId, categoryId) VALUES (?, ?)', [id, categoryId]);
    }

    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating evidence:', error);
    return NextResponse.json({ error: 'Failed to create evidence', details: error.message }, { status: 500 });
  }
}

/** PATCH: edit caption, toggle caption visibility, or retag categories. Poster only. */
export async function PATCH(request: Request) {
  const playerId = await getSessionPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(playerId, 'evidence');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { evidenceId, caption, captionHidden, categoryIds } = await request.json();
    if (!evidenceId) return NextResponse.json({ error: 'evidenceId required' }, { status: 400 });

    const post = await queryOne('SELECT playerId FROM Evidence WHERE id = ?', [evidenceId]);
    if (!post) return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    if (String(post.playerId) !== playerId) {
      return NextResponse.json({ error: 'You can only edit your own evidence' }, { status: 403 });
    }

    const now = new Date().toISOString();
    if (caption !== undefined) {
      await query('UPDATE Evidence SET caption = ?, updatedAt = ? WHERE id = ?', [
        caption?.trim() || null,
        now,
        evidenceId,
      ]);
    }
    if (typeof captionHidden === 'boolean') {
      await query('UPDATE Evidence SET captionHidden = ?, updatedAt = ? WHERE id = ?', [
        captionHidden ? 1 : 0,
        now,
        evidenceId,
      ]);
    }
    if (Array.isArray(categoryIds) && categoryIds.length > 0) {
      await query('DELETE FROM EvidenceCategory WHERE evidenceId = ?', [evidenceId]);
      for (const categoryId of [...new Set(categoryIds as string[])]) {
        await query('INSERT INTO EvidenceCategory (evidenceId, categoryId) VALUES (?, ?)', [evidenceId, categoryId]);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error updating evidence:', error);
    return NextResponse.json({ error: 'Failed to update evidence', details: error.message }, { status: 500 });
  }
}

/** DELETE: poster only, and only when no suggestion cites this evidence. */
export async function DELETE(request: Request) {
  const playerId = await getSessionPlayerId();
  if (!playerId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const lockMsg = await featureLockMessage(playerId, 'evidence');
    if (lockMsg) return NextResponse.json({ error: lockMsg }, { status: 403 });

    const { evidenceId } = await request.json();
    if (!evidenceId) return NextResponse.json({ error: 'evidenceId required' }, { status: 400 });

    const post = await queryOne(
      'SELECT playerId, cloudinaryPublicId, mediaType FROM Evidence WHERE id = ?',
      [evidenceId]
    );
    if (!post) return NextResponse.json({ error: 'Evidence not found' }, { status: 404 });
    if (String(post.playerId) !== playerId) {
      return NextResponse.json({ error: 'You can only delete your own evidence' }, { status: 403 });
    }

    const used = await queryOne('SELECT COUNT(*) as c FROM SuggestionEvidence WHERE evidenceId = ?', [evidenceId]);
    if (Number(used?.c) > 0) {
      return NextResponse.json(
        { error: 'This evidence is cited by a suggestion and can no longer be deleted (hide the caption instead)' },
        { status: 400 }
      );
    }

    // Free the storage too — a failed/unconfigured Cloudinary delete never
    // blocks the post's deletion, it just logs.
    if (post.cloudinaryPublicId) {
      const destroyed = await destroyCloudinaryAsset(
        String(post.cloudinaryPublicId),
        post.mediaType ? String(post.mediaType) : null
      );
      if (!destroyed.ok && !destroyed.skipped) {
        console.error('Cloudinary destroy failed:', destroyed.error);
      }
    }

    await query('DELETE FROM EvidenceCategory WHERE evidenceId = ?', [evidenceId]);
    await query('DELETE FROM Evidence WHERE id = ?', [evidenceId]);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting evidence:', error);
    return NextResponse.json({ error: 'Failed to delete evidence', details: error.message }, { status: 500 });
  }
}
