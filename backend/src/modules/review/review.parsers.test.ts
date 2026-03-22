import { parseDiff } from './review.parsers';

// Test 1 — Basic added line
const basicDiff = `
diff --git a/src/auth.js b/src/auth.js
+++ b/src/auth.js
@@ -14,5 +15,6 @@
 const x = req.body.input
-db.query(x)
+db.query(clean(x))
`;

const result1 = parseDiff(basicDiff);
console.assert(result1.length === 1, 'Should parse 1 file');
console.assert(result1[0].filename === 'src/auth.js', 'Filename should match');
console.assert(result1[0].changes[0].lineNumber === 16, 'Line number should be 16 (15 + 1 context line)');
console.assert(result1[0].changes[0].content === 'db.query(clean(x))', 'Content should strip leading +');
console.log('✅ Test 1 passed — basic added line');

// Test 2 — Brand new file (no comma on -side)
const newFileDiff = `
diff --git a/src/newfile.ts b/src/newfile.ts
+++ b/src/newfile.ts
@@ -0,0 +1 @@
+export const hello = 'world';
`;

const result2 = parseDiff(newFileDiff);
console.assert(result2[0].changes[0].lineNumber === 1, 'New file first line should be 1');
console.log('✅ Test 2 passed — brand new file');

// Test 3 — No added lines (only deletions)
const deletionOnlyDiff = `
diff --git a/src/old.js b/src/old.js
+++ b/src/old.js
@@ -5,3 +5,0 @@
-const x = 1;
-const y = 2;
-const z = 3;
`;

const result3 = parseDiff(deletionOnlyDiff);
console.assert(result3.length === 0, 'Deletion-only diff should return empty array');
console.log('✅ Test 3 passed — deletion only');

// Test 4 — Multiple files
const multiFileDiff = `
diff --git a/src/a.ts b/src/a.ts
+++ b/src/a.ts
@@ -1,0 +1 @@
+const a = 1;
diff --git a/src/b.ts b/src/b.ts
+++ b/src/b.ts
@@ -1,0 +1 @@
+const b = 2;
`;

const result4 = parseDiff(multiFileDiff);
console.assert(result4.length === 2, 'Should parse 2 files');
console.assert(result4[0].filename === 'src/a.ts', 'First file should be a.ts');
console.assert(result4[1].filename === 'src/b.ts', 'Second file should be b.ts');
console.log('✅ Test 4 passed — multiple files');

console.log('\n🎉 All parser tests passed');