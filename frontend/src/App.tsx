import { useEffect, useState } from 'react';
import { PRReviewDashboard } from './components/PRReviewDashboard';

function App() {
  // Mock data for the purpose of demonstrating Module 4.
  // In a real application, you would fetch these from an API, URL params, or React Router,
  // and `token` would come from your global AuthContext (Module 1).
  const [prNumber, setPrNumber] = useState(1);
  const [repoFullName, setRepoFullName] = useState('CodeWithAkthar/testing-backend');
  const [token, setToken] = useState<string>('');

  // Automatically grab the token from the URL if we just logged in via GitHub
  useEffect(() => {
    const hash = window.location.hash;
    if (hash && hash.includes('token=')) {
      const extractedToken = hash.replace('#token=', '');
      setToken(extractedToken);
      // Clean up the URL so the token isn't sitting in the address bar
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-4xl mx-auto mb-8 bg-white p-6 rounded-lg shadow border border-gray-200">
        <h2 className="text-xl font-bold mb-4 font-sans text-gray-800">Module 4 — WebSocket Demo</h2>
        <p className="text-gray-600 mb-4 font-sans text-sm">
          To see real-time streaming, start the backend server, trigger a GitHub Webhook, and paste an active JWT access token below to authenticate the WebSocket.
        </p>
        
        <div className="space-y-4 font-sans">
          <div>
            <label className="block text-sm font-medium text-gray-700">JWT Access Token</label>
            <input 
              type="text" 
              className="mt-1 w-full p-2 border border-gray-300 rounded" 
              placeholder="eyJhbGciOiJIUzI1..."
              value={token}
              onChange={(e) => setToken(e.target.value)}
            />
          </div>
          <div className="flex space-x-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700">Repository</label>
              <input 
                type="text" 
                className="mt-1 w-full p-2 border border-gray-300 rounded" 
                value={repoFullName}
                onChange={(e) => setRepoFullName(e.target.value)}
              />
            </div>
            <div className="w-32">
              <label className="block text-sm font-medium text-gray-700">PR Number</label>
              <input 
                type="number" 
                className="mt-1 w-full p-2 border border-gray-300 rounded" 
                value={prNumber}
                onChange={(e) => setPrNumber(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {token ? (
        <PRReviewDashboard 
          prNumber={prNumber} 
          repoFullName={repoFullName} 
          token={token} 
        />
      ) : (
        <div className="max-w-4xl mx-auto p-4 text-center text-gray-500 font-sans border-2 border-dashed border-gray-300 rounded-lg bg-white">
          Please enter your JWT Token above to connect to the WebSocket server.
        </div>
      )}
    </div>
  );
}

export default App;
