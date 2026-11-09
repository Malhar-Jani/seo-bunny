-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "centerLat" REAL NOT NULL,
    "centerLng" REAL NOT NULL,
    "radius" REAL NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 3,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "nextRun" DATETIME
);
INSERT INTO "new_Scan" ("centerLat", "centerLng", "createdAt", "gridSize", "id", "keyword", "radius", "status") SELECT "centerLat", "centerLng", "createdAt", "gridSize", "id", "keyword", "radius", "status" FROM "Scan";
DROP TABLE "Scan";
ALTER TABLE "new_Scan" RENAME TO "Scan";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
