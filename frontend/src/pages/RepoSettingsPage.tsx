import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import '../styles/repos.css';

interface Repo {
  _id: string;
  fullName: string;
  isActive: boolean;
  reviewCount: number;
}

export function RepoSettingsPage() {
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    apiClient.get<{ repos: Repo[] }>('/api/repos')
      .then(data => setRepos(data.repos))
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const toggleRepo = async (repoId: string, currentState: boolean) => {
    setToggling(repoId);
    try {
      await apiClient.patch(`/api/repos/${repoId}`, { isActive: !currentState });
      setRepos(repos.map(r => r._id === repoId ? { ...r, isActive: !currentState } : r));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) return <div className="loading-screen">Loading repos...</div>;

  return (
    <div className="page">
      <Link to="/dashboard" className="back-link">← Dashboard</Link>
      <h1>Connected Repositories</h1>
      <p className="text-secondary">
        Control which repos trigger AI code reviews when a PR is opened.
      </p>

      {error && <div className="error-card">{error}</div>}

      {repos.length === 0 ? (
        <div className="empty-state">
          <p>No repositories connected yet.</p>
          <p className="text-secondary">Install the GitHub App on a repo to get started.</p>
        </div>
      ) : (
        <div className="repos-list">
          {repos.map((repo) => (
            <div key={repo._id} className="repo-card">
              <div className="repo-info">
                <p className="repo-name">{repo.fullName}</p>
                <p className="text-secondary">{repo.reviewCount} review{repo.reviewCount !== 1 ? 's' : ''} total</p>
              </div>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={repo.isActive}
                  disabled={toggling === repo._id}
                  onChange={() => toggleRepo(repo._id, repo.isActive)}
                />
                <span className="toggle-slider" />
                <span className="toggle-label">{repo.isActive ? 'Active' : 'Paused'}</span>
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
