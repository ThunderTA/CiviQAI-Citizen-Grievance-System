/**
 * Drop indexes left behind by the Clerk-based schema.
 *
 * The old User model declared `clerkId` as required+unique, so MongoDB built a
 * unique, NON-sparse index on it. Accounts created after the migration have no
 * clerkId at all, and MongoDB treats every missing value as the same null key
 * — so the *second* registration on any pre-existing database failed with a
 * duplicate-key error that looked like "email already exists".
 *
 * Mongoose never removes indexes it no longer declares, so this has to be
 * explicit. Safe to run on every boot: it no-ops once the index is gone.
 */
const LEGACY_INDEXES = {
  users: ['clerkId_1'],
};

export const dropLegacyIndexes = async (connection) => {
  for (const [collectionName, indexNames] of Object.entries(LEGACY_INDEXES)) {
    const collection = connection.db.collection(collectionName);

    let existing;
    try {
      existing = await collection.indexes();
    } catch {
      // Collection does not exist yet on a fresh database — nothing to drop.
      continue;
    }

    for (const indexName of indexNames) {
      if (!existing.some(i => i.name === indexName)) continue;
      try {
        await collection.dropIndex(indexName);
        console.log(`[migration] Dropped legacy index ${collectionName}.${indexName}`);
      } catch (err) {
        console.warn(
          `[migration] Could not drop ${collectionName}.${indexName}: ${err.message}`
        );
      }
    }
  }
};
