-- CreateTable
CREATE TABLE "ReviewParticipant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewParticipant_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewParticipant_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cycleId" TEXT NOT NULL,
    "targetPlayerId" TEXT NOT NULL,
    "editorId" TEXT,
    "status" TEXT NOT NULL,
    "lastEditedById" TEXT,
    "submittedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewSession_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "ReviewCycle" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewSession_targetPlayerId_fkey" FOREIGN KEY ("targetPlayerId") REFERENCES "Player" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReviewSession_editorId_fkey" FOREIGN KEY ("editorId") REFERENCES "Player" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ReviewSession" ("createdAt", "cycleId", "id", "lastEditedById", "status", "submittedAt", "targetPlayerId", "updatedAt") SELECT "createdAt", "cycleId", "id", "lastEditedById", "status", "submittedAt", "targetPlayerId", "updatedAt" FROM "ReviewSession";
DROP TABLE "ReviewSession";
ALTER TABLE "new_ReviewSession" RENAME TO "ReviewSession";
CREATE UNIQUE INDEX "ReviewSession_cycleId_targetPlayerId_key" ON "ReviewSession"("cycleId", "targetPlayerId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ReviewParticipant_sessionId_playerId_key" ON "ReviewParticipant"("sessionId", "playerId");
