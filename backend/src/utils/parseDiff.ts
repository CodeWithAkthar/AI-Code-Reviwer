export interface ChangedLine {
  lineNumber: number;
  content: string;
}

export interface ParsedDiff {
  filename: string;
  language: string;
  changedLines: ChangedLine[];
}

export const getLanguage = (filename: string): string => {
  const extensionMatch = filename.match(/\.([^.]+)$/);
  
  if (!extensionMatch) {
    return 'unknown';
  }
  
  const ext = extensionMatch[1].toLowerCase();
  
  const languageMap: Record<string, string> = {
    js: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript',
    py: 'python',
    rb: 'ruby',
    go: 'go',
    java: 'java',
    cpp: 'cpp', c: 'c', h: 'c', hpp: 'cpp', cs: 'csharp',
    php: 'php',
    html: 'html', css: 'css', scss: 'css',
    json: 'json',
    yaml: 'yaml', yml: 'yaml',
    md: 'markdown',
    sh: 'shell', bash: 'shell', zsh: 'shell',
    rs: 'rust',
    swift: 'swift',
    kt: 'kotlin',
    sql: 'sql'
  };

  return languageMap[ext] || ext;
};

export const parseGitHubDiff = (rawDiff: string): ParsedDiff[] => {
  if (!rawDiff || typeof rawDiff !== 'string') {
    return [];
  }

  const lines = rawDiff.split('\n');
  const files: ParsedDiff[] = [];
  
  let currentFile: ParsedDiff | null = null;
  let currentLineNumber = 0;

  for (const line of lines) {
    if (line.startsWith('diff --git')) {
      // Whenever we see 'diff --git', we finalize the previous file and start a new one.
      if (currentFile && currentFile.filename && currentFile.filename !== '/dev/null') {
        files.push(currentFile);
      }
      
      currentFile = {
        filename: '',
        language: 'unknown',
        changedLines: []
      };
    } else if (line.startsWith('+++ b/')) {
      // Extracts the destination filename where the insertions happen
      if (currentFile) {
        const filename = line.slice(6); // removes '+++ b/'
        currentFile.filename = filename;
        currentFile.language = getLanguage(filename);
      }
    } else if (line.startsWith('+++ /dev/null')) {
      // It's a deleted file, diff shows it being added to the abyss.
      if (currentFile) {
        currentFile.filename = '/dev/null'; 
      }
    } else if (line.startsWith('@@ ')) {
      // Parse chunk headers: @@ -oldStart,oldLines +newStart,newLines @@
      // The `newStart` is the target line we want to start counting additions from
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      
      if (match && currentFile) {
        currentLineNumber = parseInt(match[1], 10);
      }
    } else if (currentFile && currentFile.filename !== '/dev/null') {
      // Inside a chunk, we review the changes focusing on our new line counter
      if (line.startsWith('+') && !line.startsWith('+++')) {
        currentFile.changedLines.push({
          lineNumber: currentLineNumber,
          content: line.slice(1) // Removes the leading plus symbol
        });
        currentLineNumber++;
      } else if (line.startsWith(' ') || line === '') {
        // Context lines exist in the new file, so we advance the line counter
        currentLineNumber++;
      } else if (line.startsWith('-') || line.startsWith('\\')) {
        // Deleted lines (-) or metadata like \ No newline don't advance the new file's line counter
      }
    }
  }

  // Push the final file after string traversal completes
  if (currentFile && currentFile.filename && currentFile.filename !== '/dev/null') {
    files.push(currentFile);
  }

  return files;
};
