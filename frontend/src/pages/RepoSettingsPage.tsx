import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../hooks/useTheme';
import { AppShell } from '../components/AppShell';
import '../styles/repos.css';

interface Repo {
  _id?: string;
  githubRepoId: string;
  fullName: string;
  isActive: boolean;
  reviewCount: number;
  isAppInstalled: boolean;
  installationId?: number;
  isPrivate?: boolean;
}

export function RepoSettingsPage() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [repos, setRepos] = useState<Repo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const installUrl =
    import.meta.env.VITE_GITHUB_APP_INSTALL_URL ||
    'https://github.com/apps/AI-code-reviewer-github-app/installations/new';

  useEffect(() => {
    apiClient.get<{ repos: Repo[] }>('/api/repos')
      .then(data => setRepos(data.repos))
      .catch(err => setError(err.message))
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const toggleRepo = async (githubRepoId: string, currentState: boolean) => {
    setToggling(githubRepoId);
    try {
      await apiClient.patch(`/api/repos/${githubRepoId}`, { isActive: !currentState });
      setRepos((prev) =>
        prev.map((r) =>
          r.githubRepoId === githubRepoId ? { ...r, isActive: !currentState } : r,
        ),
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setToggling(null);
    }
  };

  if (isLoading) return <div className="loading-screen">Loading repos...</div>;

  return (
    <AppShell user={user} onLogout={handleLogout} theme={theme} onToggleTheme={toggleTheme}>
      <section className="repo-page">
        <header className="repo-header">
          <h1>Connected Repositories</h1>
          <p className="text-secondary">
            Control which repos trigger AI reviews when a PR is opened.
          </p>
        </header>

        {error && <div className="error-card">{error}</div>}

        {repos.length === 0 ? (
          <div className="empty-state">
            <p>No repositories connected yet.</p>
            <p className="text-secondary">Install the GitHub App on a repo to get started.</p>
          </div>
        ) : (
          <div className="repos-list">
            {repos.map((repo) => (
              <div
                key={repo.githubRepoId}
                className={`card repo-card ${repo.isActive ? 'repo-card--active' : 'repo-card--paused'}`}
              >
                <div className="repo-info">
                  <p className="repo-name">{repo.fullName}</p>
                  <p className="text-secondary">{repo.reviewCount} review{repo.reviewCount !== 1 ? 's' : ''} total</p>
                  <div className="repo-meta">
                    <span className="badge repo-badge">{repo.isPrivate ? 'private' : 'public'}</span>
                    {repo.installationId ? (
                      <span className="text-secondary">Install #{repo.installationId}</span>
                    ) : (
                      <span className="text-secondary">GitHub App missing</span>
                    )}
                  </div>
                </div>
                {!repo.isAppInstalled ? (
                  <button
                    type="button"
                    className="btn btn-outline repo-enable-btn"
                    onClick={() => {
                      window.location.href = installUrl;
                    }}
                  >
                    Enable Reviews
                  </button>
                ) : (
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={repo.isActive}
                      disabled={toggling === repo.githubRepoId}
                      onChange={() => toggleRepo(repo.githubRepoId, repo.isActive)}
                    />
                    <span className="toggle-slider" />
                    <span className="toggle-label">{repo.isActive ? 'Active' : 'Paused'}</span>
                  </label>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}
