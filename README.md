# TechEval.MNC — AI Developer Profile & Portfolio Evaluator

## Live app

Try the public deployment: **[https://techeval-mnc.onrender.com](https://techeval-mnc.onrender.com)**

The app is hosted on Render. Its free instance may take 50 seconds or more to respond after inactiv

TechEval.MNC evaluates developer portfolios, GitHub profiles, and resume bullets against hiring expectations using Google Gemini AI and the GitHub REST API.

## Features

- Full ecosystem audit with readiness score, red flags, standouts, and a 30-day plan.
- GitHub profile and repository sync.
- Resume bullet feedback and STAR-style rewrites.
- AI career mentor follow-up chat.

## Run locally

1. Install Node.js 24 or later.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Run `npm start`, then open `http://localhost:3000`.

Never commit `.env` or share your API key. The backend endpoint is limited to 20 AI requests per IP per 15 minutes.

## Deploy on Render

This repository includes a Render Blueprint at `render.yaml`.

1. Push this project to GitHub.
2. In Render, choose **New** → **Blueprint** and connect the repository.
3. When prompted, add `GEMINI_API_KEY` as a secret environment variable. Do not put the key in the repository.
4. Deploy. Render installs dependencies, starts the Node server, and checks `/healthz`.

The generated `onrender.com` URL can be shared publicly. Gemini usage is charged against the key owner's quota, so review the provider's quotas and billing settings before sharing the app widely.

## Tech stack

- Frontend: HTML, vanilla JavaScript, Tailwind CSS CDN, Font Awesome
- Backend: Node.js and Express
- AI: Google Gemini API
- Public profile data: GitHub REST API
