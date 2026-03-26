import { ReviewJobData } from '../../queues/reviewQueue';
import { getInstallationClient } from '../../lib/githubClient';
import { parseDiff, ParsedFile } from './review.parsers';
import { buildPrompt, getModelForFile } from './review.prompts';
import Groq from 'groq-sdk';
import { Review, IComment } from './review.model';
import * as wsManager from '../../lib/wsManager';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || '',
});

// Avoid exhausting Claude context limits and output token limits.
const MAX_FILES_PER_CHUNK = 10;
const MAX_LINES_PER_CHUNK = 800;

interface GroqReviewResponse {
  summary: string;
  score: number;
  comments: IComment[];
}

import { Repository } from './repository.model';

// ... (code omitted up to processReview)
export async function processReview(jobData: ReviewJobData) {
  const { userId, repoFullName, prNumber, installationId } = jobData;
  const [owner, repo] = repoFullName.split('/');
  
  console.log(`[ReviewService] Starting review for ${owner}/${repo}#${prNumber}`);

  const repoDoc = await Repository.findOne({ fullName: repoFullName });
  if (!repoDoc) {
    throw new Error(`Repository ${repoFullName} not found in database.`);
  }

  // Create a pending review record in DB using proper referenced ObjectIds
  const reviewDb = await Review.create({
    prNumber,
    repo: repoDoc._id,
    user: userId, // userId from the payload is a string or ObjectId that mongoose casts correctly
    status: 'pending',
  });

  try {
    // --------------------------------------------------------------------------
    // STEP 2: Fetch the PR diff from GitHub
    // --------------------------------------------------------------------------
    const github = await getInstallationClient(installationId);
    
    // We request 'application/vnd.github.v3.diff' to get the raw textual unified diff
    // because it efficiently tells us exactly what changed line by line, mapping to 
    // the exact line numbers we need to post comments.
    const diffResponse = await github.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
      mediaType: {
        format: 'diff',
      },
    });
    const rawDiff = diffResponse.data as unknown as string;

    // We need the latest commit SHA to post PR review comments correctly.
    // The "get" above with mediaType='diff' returns text. We do a standard get to find the SHA.
    const prDetails = await github.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });
    const commitId = prDetails.data.head.sha;

    // --------------------------------------------------------------------------
    // STEP 3: Parse the raw diff
    // --------------------------------------------------------------------------
    const parsedFiles = parseDiff(rawDiff);
    if (parsedFiles.length === 0) {
      console.log(`[ReviewService] No added/modified lines found in diff. Skipping.`);
      await reviewDb.updateOne({ status: 'completed', summary: 'No actionable changes found.' });
      return;
    }

    // --------------------------------------------------------------------------
    // STEP 6: Chunking Strategy for Large Diffs
    // --------------------------------------------------------------------------
    // Language models have limited output tokens (max 4096 or 8192 tokens).
    // If we throw 50 files at it, it will truncate the JSON output mid-stream, breaking 
    // our `JSON.parse`. We break large PRs into safe, digestible chunks.
    const chunks: ParsedFile[][] = [];
    let currentChunk: ParsedFile[] = [];
    let currentChunkLines = 0;

    for (const file of parsedFiles) {
      const fileLineCount = file.changes.length;
      if (
        currentChunk.length >= MAX_FILES_PER_CHUNK ||
        currentChunkLines + fileLineCount > MAX_LINES_PER_CHUNK
      ) {
        if (currentChunk.length > 0) {
          chunks.push(currentChunk);
          currentChunk = [];
          currentChunkLines = 0;
        }
      }
      currentChunk.push(file);
      currentChunkLines += fileLineCount;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk);

    let totalTokensUsed = 0;
    const allComments: IComment[] = [];
    const chunkSummaries: string[] = [];
    let combinedScore = 0;

    // --------------------------------------------------------------------------
    // Process Each Chunk
    // --------------------------------------------------------------------------
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`[ReviewService] Processing chunk ${i + 1} of ${chunks.length}`);

      // ── Event 2: review:progress ────────────────────────────────────────────
      // Emitted before calling the LLM for each chunk so the UI shows which
      // files are currently being processed in real-time.
      wsManager.send(userId, {
        type: 'review:progress',
        prNumber,
        repo: repoFullName,
        chunk: i + 1,
        totalChunks: chunks.length,
        files: chunk.map(f => f.filename),
      });

      // STEP 4: Model routing logic
      // We pick the model based on the first file in the chunk for simplicity.
      // (Advanced: evaluate all files and pick the most capable required).
     const modelToUse = chunk.some(f => /auth|payment|security/i.test(f.filename))
  ? 'llama-3.3-70b-versatile'
  : getModelForFile(chunk[0].filename);

      // STEP 5: Build prompt
      const prompt = buildPrompt(chunk);

      // STEP 7: Call Groq API
      const message = await groq.chat.completions.create({
        model: modelToUse,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: "You are an AI code reviewer. Return ONLY strict JSON." },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' }
      });

      // Groq returns a standard OpenAI-like response object
      let responseText = message.choices[0]?.message?.content || '';

      totalTokensUsed += (message.usage?.prompt_tokens || 0) + (message.usage?.completion_tokens || 0);

      // Safe JSON Extraction: LLMs try to be helpful and sometimes wrap the JSON 
      // in ```json ... ``` markdown tags despite strict instructions not to.
      try {
        let cleanJsonStr = responseText.trim();
        if (cleanJsonStr.startsWith('```json')) {
          cleanJsonStr = cleanJsonStr.replace(/^```json/, '').replace(/```$/, '').trim();
        } else if (cleanJsonStr.startsWith('```')) {
          cleanJsonStr = cleanJsonStr.replace(/^```/, '').replace(/```$/, '').trim();
        }

        const parsedResult = JSON.parse(cleanJsonStr) as GroqReviewResponse;
        
        allComments.push(...(parsedResult.comments || []));
        chunkSummaries.push(parsedResult.summary || '');
        combinedScore += parsedResult.score || 0;

      } catch (err: any) {
        console.error(`[ReviewService] Failed to parse Groq JSON output. Response was: ${responseText.substring(0, 100)}...`);
        // We catch json parsing errors gracefully and continue with the next chunk
      }
    }

    const finalScore = chunks.length > 0 ? Math.round(combinedScore / chunks.length) : 0;
    const finalSummary = chunkSummaries.join(' ');

    // --------------------------------------------------------------------------
    // STEP 8: Post PR review comments to GitHub
    // --------------------------------------------------------------------------
    if (allComments.length > 0) {
      // We formulate the line-by-line comments for the GitHub Review API.
      // The Review API requires { path, line, body } inside a `comments` array.
      const githubComments = allComments.map(c => {
        const severityEmoji = c.severity === 'critical' ? '🚨' : c.severity === 'warning' ? '⚠️' : 'ℹ️';
        return {
          path: c.filename,
          // GitHub API requires the exact line number on the RIGHT side of the diff (the new file)
          line: c.line,
          body: `**${severityEmoji} [${c.category.toUpperCase()}]**\n\n**Issue:** ${c.issue}\n\n**Suggestion:** ${c.suggestion}`,
        };
      });

      try {
        await github.pulls.createReview({
          owner,
          repo,
          pull_number: prNumber,
          commit_id: commitId,
          event: 'COMMENT', // We use 'COMMENT' instead of 'REQUEST_CHANGES' so we don't aggressively block merges
          body: `### AI Code Review Complete 🤖\n\n**Overall Score:** ${finalScore}/10\n\n**Summary:** ${finalSummary}`,
          comments: githubComments,
        });
        console.log(`[ReviewService] Posted ${githubComments.length} inline comments to GitHub.`);
      } catch (err: any) {
        console.error(`[ReviewService] Failed to post GitHub review: ${err.message}`);
        // Often fails due to invalid line numbers (hallucinated by AI or out of range of the diff chunk)
        // If it throws, the comments are skipped gracefully. A production-grade system would post 
        // fall-back general comments if inline fails.
      }
    } else {
      console.log(`[ReviewService] No problematic lines found. Posting a general approval/comment.`);
      await github.issues.createComment({
        owner,
        repo,
        issue_number: prNumber, // PRs are fundamentally Issues in the GitHub API
        body: `### AI Code Review Complete 🤖\n\nEverything looks good! No inline issues found....\n\n**Score:** ${finalScore}/10`,
      });
    }

    // --------------------------------------------------------------------------
    // STEP 9: Save to MongoDB
    // --------------------------------------------------------------------------
    await reviewDb.updateOne({ _id: reviewDb._id },{$set:{
      status: 'completed',
      summary: finalSummary,
      score: finalScore,
      comments: allComments,
      tokensUsed: totalTokensUsed,
      modelUsed: chunks.length > 1 ? 'multiple' : getModelForFile((chunks[0] && chunks[0][0]) ? chunks[0][0].filename : ''),
    }});
    console.log(`[ReviewService] 💾 Saved review result to MongoDB.`);

    // ── Event 3: review:complete ───────────────────────────────────────────────
    // Send the full result to the user's browser. The React hook receives this
    // and populates the PR review panel with inline comments and the score.
    wsManager.send(userId, {
      type: 'review:complete',
      prNumber,
      repo: repoFullName,
      reviewId: reviewDb._id.toString(),
      summary: finalSummary,
      score: finalScore,
      comments: allComments,
      tokensUsed: totalTokensUsed,
    });
    console.log(`[ReviewService] 🌐 review:complete emitted to userId=${userId}`);

  } catch (error: any) {
    console.error(`[ReviewService] Critical failure processing review: ${error.message}`);
    
    // Fallback: update DB with failure
    await reviewDb.updateOne({
      status: 'failed',
      error: error.message,
    });
    
    // Re-throw so the worker registers it as a failure for retries
    throw error;
  }
}
