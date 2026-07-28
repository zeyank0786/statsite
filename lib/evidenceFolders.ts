import { query, queryAll } from './db';
import { v4 as uuid } from 'uuid';

/**
 * Evidence folders — a per-user way to group your own evidence into "projects"
 * so you can filter for everything tied to one thing. Folders are crew-visible
 * (they show as labels and anyone can filter by them), but only the owner files
 * their own evidence into their own folders. A single post can live in several
 * folders at once (join table, not a single pointer).
 */

export interface FolderOption {
  id: string;
  name: string;
  playerId: string;
  ownerName: string;
  count: number;
}

export interface EvidenceFolderTag {
  id: string;
  name: string;
  playerId: string;
  ownerName: string;
}

export const FOLDER_NAME_MAX = 40;

/** Additive tables — created on first use, no manual migration. */
export async function ensureEvidenceFolderTables(): Promise<void> {
  await query(
    `CREATE TABLE IF NOT EXISTS EvidenceFolder (
       id        TEXT PRIMARY KEY,
       playerId  TEXT NOT NULL,
       name      TEXT NOT NULL,
       createdAt TEXT NOT NULL
     )`
  );
  await query(
    `CREATE TABLE IF NOT EXISTS EvidenceFolderItem (
       folderId   TEXT NOT NULL,
       evidenceId TEXT NOT NULL,
       PRIMARY KEY (folderId, evidenceId)
     )`
  );
}

/** Every folder, with owner name and how many posts it holds. */
export async function listFolders(): Promise<FolderOption[]> {
  await ensureEvidenceFolderTables();
  const rows = await queryAll(
    `SELECT f.id, f.name, f.playerId, p.username AS ownerName,
            (SELECT COUNT(*) FROM EvidenceFolderItem i WHERE i.folderId = f.id) AS count
     FROM EvidenceFolder f
     JOIN Player p ON f.playerId = p.id
     ORDER BY p.username, f.name`
  );
  return (rows as any[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    playerId: String(r.playerId),
    ownerName: String(r.ownerName || 'Unknown'),
    count: Number(r.count) || 0,
  }));
}

/** Folder memberships keyed by evidenceId, for enriching the evidence board. */
export async function getFolderTagsByEvidence(): Promise<Map<string, EvidenceFolderTag[]>> {
  await ensureEvidenceFolderTables();
  const rows = await queryAll(
    `SELECT i.evidenceId, f.id, f.name, f.playerId, p.username AS ownerName
     FROM EvidenceFolderItem i
     JOIN EvidenceFolder f ON i.folderId = f.id
     JOIN Player p ON f.playerId = p.id`
  );
  const map = new Map<string, EvidenceFolderTag[]>();
  for (const r of rows as any[]) {
    const key = String(r.evidenceId);
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      id: String(r.id),
      name: String(r.name),
      playerId: String(r.playerId),
      ownerName: String(r.ownerName || 'Unknown'),
    });
  }
  return map;
}

export async function createFolder(playerId: string, name: string): Promise<string> {
  await ensureEvidenceFolderTables();
  const id = uuid();
  await query('INSERT INTO EvidenceFolder (id, playerId, name, createdAt) VALUES (?, ?, ?, ?)', [
    id,
    playerId,
    name,
    new Date().toISOString(),
  ]);
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await query('UPDATE EvidenceFolder SET name = ? WHERE id = ?', [name, id]);
}

export async function deleteFolder(id: string): Promise<void> {
  await query('DELETE FROM EvidenceFolderItem WHERE folderId = ?', [id]);
  await query('DELETE FROM EvidenceFolder WHERE id = ?', [id]);
}

/**
 * Replace which folders a piece of evidence belongs to. Only the owner's own
 * folders are honoured — foreign folder ids are silently dropped.
 */
export async function setEvidenceFolders(
  evidenceId: string,
  ownerPlayerId: string,
  folderIds: string[]
): Promise<void> {
  await ensureEvidenceFolderTables();
  const wanted = [...new Set(folderIds.filter(Boolean))];
  let allowed: string[] = [];
  if (wanted.length > 0) {
    const placeholders = wanted.map(() => '?').join(',');
    const owned = await queryAll(
      `SELECT id FROM EvidenceFolder WHERE playerId = ? AND id IN (${placeholders})`,
      [ownerPlayerId, ...wanted]
    );
    allowed = (owned as any[]).map((r) => String(r.id));
  }
  await query('DELETE FROM EvidenceFolderItem WHERE evidenceId = ?', [evidenceId]);
  for (const folderId of allowed) {
    await query('INSERT OR IGNORE INTO EvidenceFolderItem (folderId, evidenceId) VALUES (?, ?)', [
      folderId,
      evidenceId,
    ]);
  }
}
