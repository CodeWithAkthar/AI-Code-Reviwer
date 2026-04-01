import { parseGitHubDiff, getLanguage } from './parseDiff';

describe('parseGitHubDiff Parser Logic', () => {

  describe('getLanguage helper', () => {
    it('should extract correct language based on robust extension definitions', () => {
      expect(getLanguage('main.ts')).toBe('typescript');
      expect(getLanguage('app.js')).toBe('javascript');
      expect(getLanguage('test.py')).toBe('python');
      expect(getLanguage('index.html')).toBe('html');
      expect(getLanguage('style.css')).toBe('css');
      expect(getLanguage('data.json')).toBe('json');
      expect(getLanguage('Dockerfile')).toBe('unknown'); // edge case: no extension
      expect(getLanguage('unmapped.extension')).toBe('extension'); // edge case: unknown extension maps exactly to the raw extension
    });
  });

  describe('parseGitHubDiff', () => {

    it('should return an empty array for an empty diff securely', () => {
      const emptyDiff = '';
      const result = parseGitHubDiff(emptyDiff);
      
      expect(result).toEqual([]);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should return an empty array for null/undefined strings', () => {
      // @ts-expect-error Testing bad JS inputs
      expect(parseGitHubDiff(null)).toEqual([]);
      // @ts-expect-error Testing bad JS inputs
      expect(parseGitHubDiff(undefined)).toEqual([]);
    });

    it('should parse a typical normal single-file diff', () => {
      const normalDiff = `diff --git a/src/index.ts b/src/index.ts
index e69de29..d95f3ad 100644
--- a/src/index.ts
+++ b/src/index.ts
@@ -1,3 +1,4 @@
 import { server } from './server';
+import { config } from './config';
 
-export const start = () => {
+export const startServer = () => {
   server.listen(3000);`;

      const result = parseGitHubDiff(normalDiff);

      expect(result.length).toBe(1);
      const file = result[0];
      
      expect(file.filename).toBe('src/index.ts');
      expect(file.language).toBe('typescript');
      expect(file.changedLines.length).toBe(2);
      
      // Validating start extraction mapping correctly
      expect(file.changedLines[0]).toEqual({
        lineNumber: 2,
        content: "import { config } from './config';"
      });
      
      expect(file.changedLines[1]).toEqual({
        lineNumber: 4,
        content: "export const startServer = () => {"
      });
    });

    it('should successfully parse a multi-file unified diff', () => {
      const multiFileDiff = `diff --git a/app.js b/app.js
index f3ad3a1..b64f431 100644
--- a/app.js
+++ b/app.js
@@ -10,2 +10,3 @@
 function test() {
-  console.log('old');
+  console.log('new');
+  return true;
 }
diff --git a/readme.md b/readme.md
index 123456..789012 100644
--- a/readme.md
+++ b/readme.md
@@ -1,2 +1,2 @@
-# Old Title
+# New Title
 Description here.`;
      
      const result = parseGitHubDiff(multiFileDiff);
      
      expect(result.length).toBe(2);

      // Validate First File correctly
      expect(result[0].filename).toBe('app.js');
      expect(result[0].language).toBe('javascript');
      expect(result[0].changedLines.length).toBe(2);
      expect(result[0].changedLines[0]).toEqual({ lineNumber: 11, content: "  console.log('new');" });
      expect(result[0].changedLines[1]).toEqual({ lineNumber: 12, content: "  return true;" });

      // Validate Second File correctly
      expect(result[1].filename).toBe('readme.md');
      expect(result[1].language).toBe('markdown');
      expect(result[1].changedLines.length).toBe(1);
      expect(result[1].changedLines[0]).toEqual({ lineNumber: 1, content: "# New Title" });
    });

    it('should completely ignore entirely deleted files safely', () => {
      const fileDeletionDiff = `diff --git a/deprecated.js b/deprecated.js
index 89bf53f..0000000 100644
--- a/deprecated.js
+++ /dev/null
@@ -1,3 +0,0 @@
-const oldVar = 1;
-const foo = 'bar';
-export default oldVar;`;

      const result = parseGitHubDiff(fileDeletionDiff);
      
      expect(result.length).toBe(0); // Because AI doesn't need to review code being fully deleted!
    });
  });
});
