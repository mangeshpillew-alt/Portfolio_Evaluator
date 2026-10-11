const assert = require('node:assert/strict');
const test = require('node:test');
const {
  extractPageText,
  fetchPublicPage,
  getGitHubUsername
} = require('../profile-audit');

test('extracts readable page content without scripts and navigation', () => {
  const text = extractPageText(`
    <html><head><title>Maya Chen</title>
      <meta name="description" content="Backend engineer">
      <script>stealSecrets()</script>
    </head><body><nav>Menu item</nav><main>
      <h1>Projects</h1><p>Built a public API.</p><style>.hidden { display:none }</style>
    </main><footer>Copyright</footer></body></html>
  `);

  assert.match(text, /Page title: Maya Chen/);
  assert.match(text, /Page description: Backend engineer/);
  assert.match(text, /Projects/);
  assert.match(text, /Built a public API/);
  assert.doesNotMatch(text, /stealSecrets|Menu item|Copyright|display:none/);
});

test('accepts a public GitHub profile URL and rejects other URL shapes', () => {
  assert.equal(getGitHubUsername('https://github.com/octocat'), 'octocat');
  assert.throws(() => getGitHubUsername('http://github.com/octocat'), /public GitHub profile URL/);
  assert.throws(() => getGitHubUsername('https://github.com/octocat/repo'), /public GitHub profile URL/);
  assert.throws(() => getGitHubUsername('https://user:pass@github.com/octocat'), /public GitHub profile URL/);
});

test('blocks insecure and private-network portfolio URLs before connecting', async () => {
  await assert.rejects(fetchPublicPage('http://example.com'), /Only public HTTPS websites/);
  await assert.rejects(fetchPublicPage('https://127.0.0.1'), /Only public HTTPS websites/);
  await assert.rejects(fetchPublicPage('https://localhost'), /public IP addresses/);
});

test('restricts best-effort LinkedIn retrieval to LinkedIn hostnames', async () => {
  await assert.rejects(
    fetchPublicPage('https://linkedin.com.evil.example/in/person', { allowedHosts: ['linkedin.com'] }),
    /requested public profile provider/
  );
});
