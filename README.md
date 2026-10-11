# TechEval.MNC — AI Developer Profile & Portfolio Evaluator

TechEval.MNC evaluates developer portfolios, GitHub profiles, and resume bullets against hiring expectations using Google Gemini AI and the GitHub REST API.

## Live app

Try the public deployment: **[https://techeval-mnc.onrender.com](https://techeval-mnc.onrender.com)**

The service runs on Render's free instance and can take 50 seconds or more to respond after periods of inactivity.

## Features

- Full ecosystem audit with readiness score, red flags, standouts, and a 30-day plan.
- Ecosystem audits retrieve public portfolio-page text and GitHub profile/repository data; LinkedIn retrieval is best-effort because LinkedIn may require sign-in or block automated access.
- GitHub profile and repository sync.
- Resume bullet feedback and STAR-style rewrites.
- AI career mentor follow-up chat.

## Run locally

1. Install Node.js 24 or later.
2. Run `npm ci`.
3. Copy `.env.example` to `.env` and set `GEMINI_API_KEY` to a key from [Google AI Studio](https://aistudio.google.com/app/apikey).
4. Run `npm start`, then open `http://localhost:3000`.

Never commit `.env` or share the server API key. Server-powered evaluations and AI reports use the app owner's Gemini key and are limited to 20 requests per IP per 15 minutes.

### Optional visitor-owned mentor chat key

Visitors can use the app without enabling mentor chat. To chat with the AI mentor, a visitor may enter their own Gemini API key using **Mentor Key (Optional)**. That key is stored in the current browser session and sent directly from the browser to Google; it is not sent to this app's server. Visitors can remove it from the same menu, and it is removed when the browser session ends. Do not enter a key unless you own or are authorized to use it; keys are visible to the browser user and should be restricted/revoked through Google AI Studio as needed.

The visitor-owned key is only for mentor chat. It does not replace the deployment owner's key for evaluations or other server-powered AI reports. If the owner's quota is exhausted, those server-powered reports must wait for that quota to reset or for the owner to resolve the quota issue.

The ecosystem audit only requests public HTTPS pages, follows a maximum of three redirects, rejects URLs resolving to non-public IP addresses, and limits each retrieved page to 500 KB and 8 seconds. If a source blocks automated access or is not public, the audit reports that source as unavailable and continues with the remaining public data and the candidate's supplied details.

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

## Public deployment and API usage

The server Gemini key is never included in the browser bundle or repository. Public server-powered AI features use the deployment owner's Gemini quota and are rate-limited to 20 requests per IP per 15 minutes. Visitor-owned keys, when supplied for optional mentor chat, are sent directly to Google and use that visitor's quota.

Temporary Gemini availability errors (502/503/504) are retried automatically, and errors are shown in the app rather than in repeated browser popups. A genuinely exhausted Gemini quota cannot be fixed by retries; wait for the quota reset or adjust the key's limits/billing in Google AI Studio.
