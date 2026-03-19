/**
 * review.parsers.ts
 * Contains logic for parsing raw git unified diffs into a structured JSON array.
 */

export interface ParsedChange {
  lineNumber: number;
  type: 'added';
  content: string;
}

export interface ParsedFile {
  filename: string;
  language: string;
  changes: ParsedChange[];
}

/**
 * Parses a raw unified diff text into a structured JSON array.
 * 
 * What is a unified diff?
 * It's a format representing file changes. A typical block looks like:
 * diff --git a/src/auth.js b/src/auth.js
 * --- a/src/auth.js
 * +++ b/src/auth.js
 * @@ -14,5 +14,6 @@
 *  const x = req.body.input
 * -db.query(x)
 * +db.query(clean(x))
 * 
 * The `@@ -a,b +c,d @@` is the hunk header. `c` is the starting line number 
 * in the *new* file. 
 * - Lines starting with `+` are added. (Increments new file line number).
 * - Lines starting with ` ` (space) are unchanged context. (Increments new file line number).
 * - Lines starting with `-` are removed. (They don't exist in the new file, so ignore).
 * 
 * @param rawDiff The plaintext unified diff string from GitHub
 * @returns An array of ParsedFile
 */
export function parseDiff(rawDiff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = rawDiff.split('\n');
  
  let currentFile: ParsedFile | null = null;
  let currentLineInNewFile = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // New file started. Extract filename from `a/filepath b/filepath`
      // Usually we just read the `+++ b/filepath` line later, but grabbing it early resets state.
      if (currentFile && currentFile.changes.length > 0) {
        files.push(currentFile);
      }
      currentFile = {
        filename: '',
        language: '',
        changes: [],
      };
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith('+++ b/')) {
      const filename = line.substring(6).trim(); // Remove "+++ b/"
      currentFile.filename = filename;
      
      // Basic language detection via extension
      const ext = filename.split('.').pop() || '';
      currentFile.language = ext;
      continue;
    }

    if (line.startsWith('@@ ')) {
      // Example: @@ -14,5 +15,6 @@
      // We want to extract the `15`
      const match = line.match(/@@ -\d+,\d+ \+(\d+)(,\d+)? @@/);
      if (match && match[1]) {
        currentLineInNewFile = parseInt(match[1], 10);
      }
      continue;
    }

    // Inside a hunk, track exact line numbers
    if (line.startsWith('+') && !line.startsWith('+++')) {
      // It's an added line
      currentFile.changes.push({
        lineNumber: currentLineInNewFile,
        type: 'added',
        // content: remove the leading '+', otherwise the LLM gets confused holding onto git markup
        content: line.substring(1),
      });
      currentLineInNewFile++;
    } else if (line.startsWith(' ') || line === '') {
      // Unchanged context line. Exists in new file, so increment line counter
      currentLineInNewFile++;
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      // It's a removed line. It does NOT exist in the new file.
      // Do NOT increment currentLineInNewFile.
    }
  }

  // Push the final file if it has changes
  if (currentFile && currentFile.changes.length > 0) {
    files.push(currentFile);
  }

  return files;
}
