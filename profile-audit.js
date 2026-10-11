const dns = require('node:dns').promises;
const https = require('node:https');
const ipaddr = require('ipaddr.js');
const cheerio = require('cheerio');

const MAX_HTML_BYTES = 500 * 1024;
const MAX_REDIRECTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
const MAX_PAGE_TEXT_CHARS = 2500;
const USER_AGENT = 'TechEvalMNC/1.0 (public profile audit)';

function validateUrl(value, { allowedHosts } = {}) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The URL is invalid.');
  }

  const hostname = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    ipaddr.isValid(hostname)
  ) {
    throw new Error('Only public HTTPS websites on the standard port are supported.');
  }

  if (allowedHosts && !allowedHosts.some(host => hostname === host || hostname.endsWith(`.${host}`))) {
    throw new Error('The URL must point to the requested public profile provider.');
  }

  url.hash = '';
  return url;
}

async function resolvePublicAddress(hostname) {
  const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  if (
    addresses.length === 0 ||
    addresses.some(({ address }) => {
      try {
        return ipaddr.parse(address).range() !== 'unicast';
      } catch {
        return true;
      }
    })
  ) {
    throw new Error('The site does not resolve exclusively to public IP addresses.');
  }

  return addresses[0];
}

function requestHttps(url, address) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let request;
    let timeoutId;

    const fail = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      if (request) request.destroy();
      reject(error);
    };

    const succeed = value => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(value);
    };

    timeoutId = setTimeout(() => fail(new Error('The site took too long to respond.')), REQUEST_TIMEOUT_MS);
    request = https.request({
      hostname: url.hostname,
      port: 443,
      path: `${url.pathname}${url.search}`,
      method: 'GET',
      agent: false,
      lookup: (_hostname, options, callback) => {
        if (options && options.all) {
          callback(null, [address]);
        } else {
          callback(null, address.address, address.family);
        }
      },
      headers: {
        Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9',
        'User-Agent': USER_AGENT
      }
    }, response => {
      const statusCode = response.statusCode || 0;
      if (statusCode >= 300 && statusCode < 400 && response.headers.location) {
        response.resume();
        response.on('end', () => succeed({ redirect: response.headers.location }));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        response.on('end', () => fail(new Error(`The site returned HTTP ${statusCode}.`)));
        return;
      }

      const contentType = String(response.headers['content-type'] || '').toLowerCase();
      if (!/^(text\/html|application\/xhtml\+xml|text\/plain)(?:;|$)/.test(contentType)) {
        response.resume();
        response.on('end', () => fail(new Error('The URL did not return a readable web page.')));
        return;
      }

      const declaredLength = Number(response.headers['content-length']);
      if (Number.isFinite(declaredLength) && declaredLength > MAX_HTML_BYTES) {
        response.resume();
        response.on('end', () => fail(new Error('The web page is larger than the 500 KB retrieval limit.')));
        return;
      }

      const chunks = [];
      let totalBytes = 0;
      response.on('data', chunk => {
        totalBytes += chunk.length;
        if (totalBytes > MAX_HTML_BYTES) {
          fail(new Error('The web page is larger than the 500 KB retrieval limit.'));
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        succeed({ body: Buffer.concat(chunks).toString('utf8'), contentType });
      });
      response.on('error', fail);
      response.on('aborted', () => fail(new Error('The site interrupted the page download.')));
    });

    request.on('error', fail);
    request.end();
  });
}

async function fetchPublicPage(value, options = {}) {
  let url = validateUrl(value, options);

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
    const address = await resolvePublicAddress(url.hostname);
    const result = await requestHttps(url, address);
    if (!result.redirect) return result.body;
    if (redirectCount === MAX_REDIRECTS) {
      throw new Error('The site redirected too many times.');
    }
    url = validateUrl(new URL(result.redirect, url).toString(), options);
  }

  throw new Error('The site could not be retrieved.');
}

function extractPageText(html) {
  const $ = cheerio.load(html);
  const title = $('title').first().text().trim();
  const description = $('meta[name="description"]').attr('content')
    || $('meta[property="og:description"]').attr('content')
    || '';

  $('script, style, noscript, svg, iframe, nav, footer, form').remove();
  const contentRoot = $('main').length ? $('main') : $('body');
  const headings = contentRoot.find('h1, h2, h3').map((_, element) => $(element).text()).get();
  const bodyText = contentRoot.text().replace(/\s+/g, ' ').trim();
  const sections = [
    title && `Page title: ${title}`,
    description && `Page description: ${description}`,
    headings.length && `Headings: ${headings.join(' | ')}`,
    bodyText
  ].filter(Boolean);

  return sections.join('\n').slice(0, MAX_PAGE_TEXT_CHARS);
}

function getGitHubUsername(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The GitHub profile URL is invalid.');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    (url.port && url.port !== '443') ||
    !['github.com', 'www.github.com'].includes(url.hostname.toLowerCase()) ||
    segments.length !== 1 ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(segments[0])
  ) {
    throw new Error('Enter a public GitHub profile URL such as https://github.com/username.');
  }

  return segments[0];
}

async function fetchGitHubProfile(value) {
  const username = getGitHubUsername(value);
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': USER_AGENT,
    'X-GitHub-Api-Version': '2022-11-28'
  };
  const options = { headers, redirect: 'error', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  const [userResponse, reposResponse] = await Promise.all([
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}`, options),
    fetch(`https://api.github.com/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=6`, options)
  ]);

  for (const response of [userResponse, reposResponse]) {
    if (response.status === 403) throw new Error('GitHub public API rate limit reached.');
    if (response.status === 404) throw new Error('The public GitHub profile was not found.');
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}.`);
  }

  const [user, repositories] = await Promise.all([userResponse.json(), reposResponse.json()]);
  if (!Array.isArray(repositories)) throw new Error('GitHub returned malformed repository data.');

  const summary = [
    `GitHub username: ${user.login}`,
    `Name: ${user.name || 'Not provided'}`,
    `Bio: ${user.bio || 'Not provided'}`,
    `Public repositories: ${user.public_repos ?? 'Unknown'}`,
    `Followers: ${user.followers ?? 'Unknown'}`,
    `Repositories (up to six most recently updated): ${repositories.map(repository => [
      repository.name,
      repository.language || 'language not specified',
      repository.description || 'no description',
      `${repository.stargazers_count || 0} stars`,
      repository.homepage || ''
    ].filter(Boolean).join(' — ')).join('\n') || 'No public repositories found.'}`
  ].join('\n');

  return summary.slice(0, MAX_PAGE_TEXT_CHARS);
}

async function readSource(fetcher) {
  try {
    const text = await fetcher();
    if (!text.trim()) throw new Error('No readable public profile content was found.');
    return { status: 'available', text };
  } catch (error) {
    return { status: 'unavailable', reason: error.message || 'The public profile could not be retrieved.' };
  }
}

async function collectFootprint({ portfolioUrl, githubUrl, linkedinUrl }) {
  const portfolio = readSource(async () => {
    const html = await fetchPublicPage(portfolioUrl);
    return extractPageText(html);
  });
  const github = readSource(() => fetchGitHubProfile(githubUrl));
  const linkedin = linkedinUrl
    ? readSource(async () => {
      const html = await fetchPublicPage(linkedinUrl, {
        allowedHosts: ['linkedin.com']
      });
      return extractPageText(html);
    })
    : Promise.resolve({ status: 'not-provided' });

  const [portfolioResult, githubResult, linkedinResult] = await Promise.all([
    portfolio,
    github,
    linkedin
  ]);

  return {
    portfolio: portfolioResult,
    github: githubResult,
    linkedin: linkedinResult
  };
}

module.exports = {
  collectFootprint,
  extractPageText,
  fetchPublicPage,
  getGitHubUsername
};
