import path from 'path';
import fs from 'fs';
import { getDatabasePath, isPackaged } from './paths';

/**
 * SQLite CREATE TABLE statements derived from prisma/schema.prisma.
 * Uses IF NOT EXISTS so it's safe to run on every launch.
 * This removes the need for the 100MB prisma CLI in the packaged app.
 */
const SCHEMA_SQL = `
-- CreateTable
CREATE TABLE IF NOT EXISTS "Scan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "keyword" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "centerLat" REAL NOT NULL,
    "centerLng" REAL NOT NULL,
    "radius" REAL NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 3,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "customPoints" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'ONCE',
    "nextRun" DATETIME,
    "businessName" TEXT,
    "savedBusinessId" TEXT,
    "placeId" TEXT,
    "currentRunId" TEXT
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Result" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scanId" TEXT NOT NULL,
    "runId" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lat" REAL NOT NULL,
    "lng" REAL NOT NULL,
    "rank" INTEGER,
    "targetName" TEXT,
    "placeId" TEXT,
    "cid" TEXT,
    "captureStatus" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "captureError" TEXT,
    "topResults" TEXT NOT NULL,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Result_scanId_fkey" FOREIGN KEY ("scanId") REFERENCES "Scan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Proxy" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT,
    "password" TEXT,
    "type" TEXT NOT NULL DEFAULT 'RESIDENTIAL',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'UNTESTED',
    "lastTestedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Alert" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "scanId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GlobalSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SystemLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "source" TEXT,
    "details" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Webhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "url" TEXT NOT NULL,
    "events" TEXT NOT NULL,
    "secret" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GridPreset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "centerLat" REAL NOT NULL,
    "centerLng" REAL NOT NULL,
    "radius" REAL NOT NULL,
    "gridSize" INTEGER NOT NULL DEFAULT 3,
    "shape" TEXT NOT NULL DEFAULT 'SQUARE',
    "customPoints" TEXT,
    "locationName" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SavedBusiness" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "placeId" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "category" TEXT,
    "googleUrl" TEXT,
    "lat" REAL,
    "lng" REAL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoogleCredential" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'local',
    "clientId" TEXT NOT NULL,
    "secretEncrypted" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoogleConnection" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'local',
    "clientId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "refreshEncrypted" TEXT NOT NULL,
    "accessEncrypted" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scopes" TEXT NOT NULL,
    "connectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoogleOAuthAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "browserHash" TEXT NOT NULL,
    "verifierEncrypted" TEXT NOT NULL,
    "nonce" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "credentialVersion" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoogleBusinessLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "profileEncrypted" TEXT,
    "profileExpiresAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GoogleBusinessLink_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SavedBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "actionType" TEXT NOT NULL DEFAULT 'NONE',
    "actionUrl" TEXT,
    "imageUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" DATETIME,
    "approvedAt" DATETIME,
    "approvedSubject" TEXT,
    "targetLocation" TEXT,
    "googleName" TEXT,
    "error" TEXT,
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessPost_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SavedBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReplyDraft" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "reviewKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "publishedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReplyDraft_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SavedBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "GoogleReviewCache" (
    "businessId" TEXT NOT NULL PRIMARY KEY,
    "subject" TEXT NOT NULL,
    "locationName" TEXT NOT NULL,
    "contentEncrypted" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "syncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoogleReviewCache_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SavedBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "BusinessContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "notes" TEXT,
    "permission" BOOLEAN NOT NULL DEFAULT false,
    "stage" TEXT NOT NULL DEFAULT 'NEW',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BusinessContact_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "SavedBusiness" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewAnalysis" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "businessName" TEXT NOT NULL,
    "businessUrl" TEXT NOT NULL,
    "savedBusinessId" TEXT,
    "collectedReviews" INTEGER NOT NULL DEFAULT 0,
    "collectionComplete" BOOLEAN,
    "languageCoverage" REAL,
    "placeId" TEXT,
    "totalReviews" INTEGER NOT NULL DEFAULT 0,
    "averageRating" REAL NOT NULL DEFAULT 0,
    "analysisData" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "currentRunId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "stage" TEXT NOT NULL DEFAULT 'Waiting to start',
    "logs" TEXT NOT NULL DEFAULT '[]',
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReviewJob_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReviewAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "ReviewRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "averageRating" REAL NOT NULL,
    "totalReviews" INTEGER NOT NULL,
    "collectedReviews" INTEGER NOT NULL,
    "collectionComplete" BOOLEAN NOT NULL,
    "languageCoverage" REAL NOT NULL,
    "analysisData" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewRun_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReviewAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "Review" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "analysisId" TEXT NOT NULL,
    "runId" TEXT,
    "runAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewerName" TEXT NOT NULL,
    "reviewerUrl" TEXT,
    "reviewImage" TEXT,
    "reviewCount" INTEGER,
    "photoCount" INTEGER,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "publishedDate" TEXT,
    "responseText" TEXT,
    "responseDate" TEXT,
    "sentimentScore" REAL,
    "sentimentLabel" TEXT,
    "isLikelyFake" BOOLEAN NOT NULL DEFAULT false,
    "fakeScore" REAL,
    "analysisBlob" TEXT,
    CONSTRAINT "Review_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "ReviewAnalysis" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Scan_status_idx" ON "Scan"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Scan_createdAt_idx" ON "Scan"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Scan_nextRun_idx" ON "Scan"("nextRun");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Result_scanId_idx" ON "Result"("scanId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Result_scanId_runId_idx" ON "Result"("scanId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Proxy_host_port_key" ON "Proxy"("host", "port");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_read_idx" ON "Alert"("read");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Alert_scanId_idx" ON "Alert"("scanId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GlobalSetting_key_key" ON "GlobalSetting"("key");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Webhook_enabled_idx" ON "Webhook"("enabled");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GridPreset_name_idx" ON "GridPreset"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SavedBusiness_name_idx" ON "SavedBusiness"("name");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "GoogleOAuthAttempt_expiresAt_idx" ON "GoogleOAuthAttempt"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleBusinessLink_businessId_key" ON "GoogleBusinessLink"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GoogleBusinessLink_subject_locationName_key" ON "GoogleBusinessLink"("subject", "locationName");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessPost_businessId_createdAt_idx" ON "BusinessPost"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessPost_status_scheduledAt_idx" ON "BusinessPost"("status", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReplyDraft_businessId_reviewKey_key" ON "ReplyDraft"("businessId", "reviewKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "BusinessContact_businessId_createdAt_idx" ON "BusinessContact"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewAnalysis_status_idx" ON "ReviewAnalysis"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewAnalysis_createdAt_idx" ON "ReviewAnalysis"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewJob_analysisId_key" ON "ReviewJob"("analysisId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewJob_status_idx" ON "ReviewJob"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "ReviewRun_analysisId_idx" ON "ReviewRun"("analysisId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Review_analysisId_idx" ON "Review"("analysisId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Review_analysisId_runId_idx" ON "Review"("analysisId", "runId");

`;

/**
 * Columns that may have been added after initial table creation.
 * ALTER TABLE ADD COLUMN is idempotent-safe in SQLite (errors if exists, which we catch).
 */
const MIGRATION_COLUMNS = [
  { table: 'Result', column: 'runId', type: 'TEXT' },
  { table: 'Result', column: 'runAt', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { table: 'Scan', column: 'currentRunId', type: 'TEXT' },
  { table: 'ReviewAnalysis', column: 'currentRunId', type: 'TEXT' },
  { table: 'Review', column: 'runId', type: 'TEXT' },
  { table: 'Review', column: 'runAt', type: 'DATETIME DEFAULT CURRENT_TIMESTAMP' },
  { table: 'Result', column: 'cid', type: 'TEXT' },
  { table: 'Result', column: 'captureStatus', type: "TEXT NOT NULL DEFAULT 'UNKNOWN'" },
  { table: 'Result', column: 'captureError', type: 'TEXT' },
  { table: 'Scan', column: 'placeId', type: 'TEXT' },
  { table: 'Scan', column: 'customPoints', type: 'TEXT' },
  { table: 'Scan', column: 'savedBusinessId', type: 'TEXT' },
  { table: 'ReviewAnalysis', column: 'savedBusinessId', type: 'TEXT' },
  { table: 'ReviewAnalysis', column: 'collectedReviews', type: 'INTEGER NOT NULL DEFAULT 0' },
  { table: 'ReviewAnalysis', column: 'collectionComplete', type: 'BOOLEAN' },
  { table: 'ReviewAnalysis', column: 'languageCoverage', type: 'REAL' },
];

export function setupDatabase(): void {
  const dbPath = getDatabasePath();
  const dbDir = path.dirname(dbPath);

  // Ensure userData directory exists
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  // Check for legacy location (web dev → desktop migration).
  // Search multiple candidate paths since process.cwd() is unpredictable in packaged apps.
  if (!fs.existsSync(dbPath)) {
    console.log('[db-setup] Database not found, checking legacy locations...');
    const legacyCandidates = [
      path.join(process.cwd(), 'prisma', 'dev.db'),
      path.join(path.dirname(path.dirname(dbDir)), 'prisma', 'dev.db'), // project root
    ];
    for (const candidate of legacyCandidates) {
      if (fs.existsSync(candidate)) {
        fs.copyFileSync(candidate, dbPath);
        console.log('[db-setup] Migrated database from', candidate);
        break;
      }
    }
  }

  // Electron 45 ships Node 24's SQLite API; no native addon/compiler is needed.
  try {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(dbPath);

    // Enable WAL mode for better concurrent performance
    db.exec('PRAGMA journal_mode = WAL');

    // Create all tables and indexes
    db.exec(SCHEMA_SQL);
    console.log('[db-setup] Schema applied successfully');

    // Apply column migrations (safe for existing databases)
    for (const { table, column, type } of MIGRATION_COLUMNS) {
      try {
        db.exec(`ALTER TABLE "${table}" ADD COLUMN "${column}" ${type}`);
        console.log(`[db-setup] Added column ${table}.${column}`);
      } catch (e: any) {
        // Only swallow "column already exists" — rethrow anything else (disk full, corruption, etc.)
        if (!e?.message?.toLowerCase().includes('duplicate column') &&
            !e?.message?.toLowerCase().includes('already exists')) {
          throw e;
        }
      }
    }

    db.close();
    console.log('[db-setup] Database ready');
  } catch (err: any) {
    console.error('[db-setup] Schema setup error:', err.message);
    // Packaged applications must never fall back to a system Prisma install.
    if (isPackaged()) {
      throw new Error(`Database initialization failed: ${err.message}\n\nThe app cannot continue without a working database.`);
    }
    // Dev only: fall back to prisma CLI
    fallbackPrismaSetup(dbPath);
  }
}

function fallbackPrismaSetup(dbPath: string): void {
  try {
    const { execSync } = require('child_process');
    const { getResourcesDir } = require('./paths');

    const schemaPath = isPackaged()
      ? path.join(getResourcesDir(), 'prisma', 'schema.prisma')
      : path.join(__dirname, '..', 'prisma', 'schema.prisma');

    const env = {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
    };

    execSync(`npx prisma db push --schema="${schemaPath}" --skip-generate`, {
      env,
      stdio: 'pipe',
      timeout: 30000,
    });
    console.log('[db-setup] Fallback prisma push complete');
  } catch (err: any) {
    console.error('[db-setup] Fallback prisma push failed:', err.message);
  }
}
