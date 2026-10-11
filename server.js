require('dotenv').config();
const express = require('express');
const path = require('path');
const { rateLimit } = require('express-rate-limit');
const { collectFootprint } = require('./profile-audit');

const app = express();
const PORT = process.env.PORT || 3000;
const MODEL_NAME = 'gemini-3.8-flash';

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(express.static(__dirname));

const geminiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many AI requests. Please try again in 15 minutes.' }
});

const footprintLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many profile fetches. Please try again in 15 minutes.' }
});

app.get('/healthz', (req, res) => {
  res.sendStatus(200);
});

app.post('/api/footprint', footprintLimiter, async (req, res) => {
  const { portfolioUrl, githubUrl, linkedinUrl = '' } = req.body || {};
  if (typeof portfolioUrl !== 'string' || !portfolioUrl || typeof githubUrl !== 'string' || !githubUrl) {
    return res.status(400).json({ error: 'Portfolio and GitHub profile URLs are required.' });
  }
  if (typeof linkedinUrl !== 'string') {
    return res.status(400).json({ error: 'LinkedIn profile URL must be a string.' });
  }
  if ([portfolioUrl, githubUrl, linkedinUrl].some(value => value.length > 2048)) {
    return res.status(400).json({ error: 'Profile URLs must be 2,048 characters or fewer.' });
  }

  try {
    const footprint = await collectFootprint({ portfolioUrl, githubUrl, linkedinUrl });
    return res.json(footprint);
  } catch (error) {
    return res.status(500).json({ error: 'Failed to collect public profile data.' });
  }
});

app.post('/api/gemini', geminiLimiter, async (req, res) => {
  const { prompt, isJson = false } = req.body || {};

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Prompt is required.' });
  }
  if (prompt.length > 30000) {
    return res.status(413).json({ error: 'Prompt exceeds the 30,000 character limit.' });
  }
  if (typeof isJson !== 'boolean') {
    return res.status(400).json({ error: 'isJson must be a boolean.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured on the server.'
    });
  }

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${apiKey}`;
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: isJson ? { responseMimeType: 'application/json' } : {}
      })
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const retryAfter = response.headers.get('retry-after');
      if (retryAfter && /^\d+$/.test(retryAfter)) {
        res.set('Retry-After', retryAfter);
      }

      return res.status(response.status).json({
        code: response.status === 429 ? 'GEMINI_QUOTA_EXCEEDED' : 'GEMINI_UPSTREAM_ERROR',
        error: data.error?.message || 'Gemini API request failed.'
      });
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return res.json({ text });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to reach Gemini API. Please try again later.'
    });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`TechEval.MNC is running at http://localhost:${PORT}`);
});
