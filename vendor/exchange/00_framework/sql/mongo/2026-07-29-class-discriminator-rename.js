// Mongo migration — Java package root rename.
//
// WHY THIS FILE HAS TO EXIST
//
// Spring Data MongoDB stamps a `_class` type discriminator into every document
// it writes. Renaming the Java package root therefore does not only touch
// source: it changes the value every historical document claims to be. Without
// this migration the K-line history behind the chart keeps naming a package
// that no longer ships, so the rename and this script are one change and must
// travel together.
//
// The vendor tree carries no migration framework, so this is a plain mongosh
// script — the lowest-common-denominator thing that runs in any environment
// that has a mongo shell.
//
// IDEMPOTENT. Re-running it is a no-op: it only matches documents whose
// `_class` still begins with the old prefix.
//
// USAGE
//
//   mongosh "<uri>/<database>" 2026-07-29-class-discriminator-rename.js
//
// or, against a container:
//
//   docker exec <mongo> mongosh <database> --quiet --file /path/to/this.js
//
// Set DRY_RUN=1 in the environment to count without writing.

const OLD_PREFIX = 'com.bizzan.bitrade.';
const NEW_PREFIX = 'com.intafaced.';

// Reversal, if this ever has to be undone, is the same script with these two
// constants swapped. Nothing else about it is directional.

const dryRun = String(process.env.DRY_RUN || '') === '1';

let collectionsTouched = 0;
let documentsMatched = 0;
let documentsWritten = 0;
const perClass = {};

print('');
print('  mongo _class rename   ' + OLD_PREFIX + '*  ->  ' + NEW_PREFIX + '*');
print('  database              ' + db.getName());
print('  mode                  ' + (dryRun ? 'DRY RUN (no writes)' : 'WRITE'));
print('');

// A regex anchored at the start, so `com.bizzan.bitrade.entity.KLine` matches
// but a field that merely contains the string somewhere does not. `_class` is
// always a fully-qualified class name, so anchoring is safe and exact.
const matcher = { _class: { $regex: '^' + OLD_PREFIX.replace(/\./g, '\\.') } };

for (const name of db.getCollectionNames()) {
  const coll = db.getCollection(name);

  // Group first, so the log says which types moved rather than only how many
  // documents did. If a type shows up here that nobody expected, that is worth
  // seeing before the write, not after.
  const groups = coll.aggregate([{ $match: matcher }, { $group: { _id: '$_class', n: { $sum: 1 } } }]).toArray();

  if (groups.length === 0) continue;

  collectionsTouched += 1;
  for (const g of groups) {
    documentsMatched += g.n;
    perClass[g._id] = (perClass[g._id] || 0) + g.n;
  }

  if (dryRun) continue;

  // One updateMany per distinct old value. $set with a computed string rather
  // than an aggregation pipeline, so this also runs on MongoDB < 4.2.
  for (const g of groups) {
    const next = NEW_PREFIX + String(g._id).slice(OLD_PREFIX.length);
    const res = coll.updateMany({ _class: g._id }, { $set: { _class: next } });
    documentsWritten += res.modifiedCount;
  }
}

print('  collections matched   ' + collectionsTouched);
print('  documents matched     ' + documentsMatched);
if (!dryRun) print('  documents written     ' + documentsWritten);
print('');
for (const k of Object.keys(perClass).sort()) {
  print('    ' + String(perClass[k]).padStart(8) + '  ' + k + '  ->  ' + NEW_PREFIX + k.slice(OLD_PREFIX.length));
}
print('');

// Verification pass — the script asserts its own outcome rather than leaving
// that to whoever ran it. An unmigrated document left behind is a failure, not
// a warning.
if (!dryRun) {
  let residual = 0;
  for (const name of db.getCollectionNames()) {
    residual += db.getCollection(name).countDocuments(matcher);
  }
  if (residual > 0) {
    print('  ✖ ' + residual + ' document(s) still carry the old prefix');
    quit(1);
  }
  print('  ✓ 0 documents carry the old prefix');
}
print('');
