import React from 'react';
import { useReviewSocket } from '../hooks/useReviewSocket';

interface Props {
  prNumber: number;
  repoFullName: string;
  token: string; // Passed down from auth context
}

/**
 * PR Review Dashboard
 * Shows real-time progress of an AI code review using the custom hook.
 */
export function PRReviewDashboard({ prNumber, repoFullName, token }: Props) {
  // Step 7 Verification: Wire the hook to the page
  const { status, progress, result, error } = useReviewSocket(prNumber, token, repoFullName);

  return (
    <div className="p-6 max-w-4xl mx-auto font-sans">
      <h1 className="text-2xl font-bold mb-4">
        AI Review for {repoFullName}#{prNumber}
      </h1>

      {/* ── Status Indicator ────────────────────────────────────────── */}
      <div className="mb-8 p-4 bg-gray-50 rounded-lg border border-gray-200">
        <h2 className="text-lg font-semibold text-gray-700">Live Status</h2>
        
        {status === 'idle' && (
          <p className="text-gray-500">Waiting for webhook event...</p>
        )}
        
        {status === 'reviewing' && (
          <div className="flex items-center text-blue-600">
            <span className="animate-pulse mr-2">🟢</span>
            <span>Review in progress...</span>
          </div>
        )}
        
        {status === 'complete' && (
          <div className="text-green-600 font-semibold">
            ✅ Review Complete
          </div>
        )}

        {status === 'failed' && (
          <div className="text-red-500">
            ❌ Review Failed: {error}
          </div>
        )}

        {/* ── Progress Indicator (shows which files are being processed) ── */}
        {progress && status === 'reviewing' && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <p className="text-sm font-medium text-gray-600">
              Analyzing chunk {progress.currentChunk} of {progress.totalChunks}:
            </p>
            <ul className="list-disc pl-5 mt-2 text-sm text-gray-500">
              {progress.filesBeingAnalyzed.map(file => (
                <li key={file} className="truncate">{file}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* ── Final Result Display ──────────────────────────────────────── */}
      {result && status === 'complete' && (
        <div className="bg-white rounded-lg shadow border border-gray-200 p-6">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold">Review Summary</h2>
              <p className="text-gray-600 mt-2">{result.summary}</p>
            </div>
            <div className={`text-2xl font-bold p-3 rounded-full ${
              result.score >= 8 ? 'bg-green-100 text-green-700' :
              result.score >= 5 ? 'bg-yellow-100 text-yellow-700' :
              'bg-red-100 text-red-700'
            }`}>
              {result.score}/10
            </div>
          </div>

          <h3 className="text-lg font-semibold mb-4">Inline Comments ({result.comments.length})</h3>
          <div className="space-y-4">
            {result.comments.map((comment, index) => (
              <div key={index} className="p-4 border border-gray-200 rounded-md">
                <div className="flex items-center space-x-2 mb-2">
                  <span className="text-sm font-medium bg-gray-100 px-2 py-1 rounded">
                    {comment.filename}:{comment.line}
                  </span>
                  <span className={`text-xs px-2 py-1 rounded-full uppercase tracking-wider ${
                    comment.severity === 'critical' ? 'bg-red-100 text-red-700' :
                    comment.severity === 'warning' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {comment.severity}
                  </span>
                </div>
                <p className="text-gray-800 font-medium">{comment.issue}</p>
                <p className="text-gray-600 mt-1 text-sm">💡 Suggestion: {comment.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
