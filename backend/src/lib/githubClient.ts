import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

let appPrivateKey = (process.env.GITHUB_APP_PRIVATE_KEY || '').replace(/\\n/g, '\n');

// During local dev, if it's not base64/escaped properly, we just make sure there are real newlines.
// Some environments pass the raw multiline string, others pass single-line with literal \n
if (!appPrivateKey.includes('\n')) {
    console.warn('GITHUB_APP_PRIVATE_KEY might not be formatted correctly (missing newlines).');
}

/**
 * Creates an authenticated Octokit instance specifically for an installation.
 * 
 * GitHub Apps authenticate in two stages:
 * 1. As the App itself (using JWT signed by the private key).
 * 2. As an Installation (using an access token generated from the App JWT).
 * 
 * This returns the Installation Octokit, which gives us permissions to read/write 
 * PRs on the specific repository where this webhook came from.
 * 
 * @param installationId Found in the webhook payload (jobData.installationId)
 */
export async function getInstallationClient(installationId: number): Promise<Octokit> {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = appPrivateKey;

  if (!appId || !privateKey) {
    throw new Error('GITHUB_APP_ID or GITHUB_APP_PRIVATE_KEY is missing.');
  }

  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId,
      privateKey,
      installationId,
    },
  });

  // Verify authentication works by forcing auth resolution early (optional but good for fail-fast)
  // await octokit.auth({ type: 'installation' });

  return octokit;
}
