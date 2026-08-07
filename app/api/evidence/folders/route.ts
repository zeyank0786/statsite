import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { getAuthOptions } from '@/lib/auth';
import { queryOne } from '@/lib/db';
import {
  ensureEvidenceFolderTables,
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  FOLDER_NAME_MAX,
} from '@/lib/evidenceFolders';
import { errorPayload } from '@/lib/apiError';

export const dynamic = 'force-dynamic';

async function getActor(): Promise<{ playerId: string; isAdmin: boolean } | null> {
  const authOptions = await getAuthOptions();
  const session = await getServerSession(authOptions);
  const playerId = (session?.user as any)?.playerId;
  const userId = (session?.user as any)?.id;
  if (!playerId) return null;
  let isAdmin = false;
  if (userId) {
    const row = await queryOne('SELECT isAdmin FROM User WHERE id = ?', [userId]);
    isAdmin = Boolean(row && Number(row.isAdmin));
  }
  return { playerId: String(playerId), isAdmin };
}

/** GET → every folder (crew-visible), with owner + post count. */
export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const folders = await listFolders();
    return NextResponse.json({ folders });
  } catch (error: any) {
    console.error('Error listing folders:', error);
    return NextResponse.json(errorPayload('Failed to list folders', error), { status: 500 });
  }
}

/** POST { name } → create a folder you own. */
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { name } = await request.json();
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return NextResponse.json({ error: 'Give the folder a name' }, { status: 400 });
    if (clean.length > FOLDER_NAME_MAX) {
      return NextResponse.json({ error: `Name must be ${FOLDER_NAME_MAX} characters or fewer` }, { status: 400 });
    }
    const id = await createFolder(actor.playerId, clean);
    return NextResponse.json({ success: true, id });
  } catch (error: any) {
    console.error('Error creating folder:', error);
    return NextResponse.json(errorPayload('Failed to create folder', error), { status: 500 });
  }
}

/** PATCH { id, name } → rename your folder (admins can rename any). */
export async function PATCH(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureEvidenceFolderTables();
    const { id, name } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const clean = typeof name === 'string' ? name.trim() : '';
    if (!clean) return NextResponse.json({ error: 'Give the folder a name' }, { status: 400 });
    if (clean.length > FOLDER_NAME_MAX) {
      return NextResponse.json({ error: `Name must be ${FOLDER_NAME_MAX} characters or fewer` }, { status: 400 });
    }
    const folder = await queryOne('SELECT playerId FROM EvidenceFolder WHERE id = ?', [id]);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    if (!actor.isAdmin && String(folder.playerId) !== actor.playerId) {
      return NextResponse.json({ error: 'You can only rename your own folders' }, { status: 403 });
    }
    await renameFolder(String(id), clean);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error renaming folder:', error);
    return NextResponse.json(errorPayload('Failed to rename folder', error), { status: 500 });
  }
}

/** DELETE { id } → delete your folder (the evidence itself is untouched). */
export async function DELETE(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    await ensureEvidenceFolderTables();
    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
    const folder = await queryOne('SELECT playerId FROM EvidenceFolder WHERE id = ?', [id]);
    if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 });
    if (!actor.isAdmin && String(folder.playerId) !== actor.playerId) {
      return NextResponse.json({ error: 'You can only delete your own folders' }, { status: 403 });
    }
    await deleteFolder(String(id));
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting folder:', error);
    return NextResponse.json(errorPayload('Failed to delete folder', error), { status: 500 });
  }
}
