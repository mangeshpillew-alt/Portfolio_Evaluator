// ========================================================
// TECH EVAL MNC - CLIENT CONTROLLER
// ========================================================
const MODEL_NAME = "gemini-3.8-flash";

let currentTab = 'ecosystem';
let latestAuditContext = null;
let pendingMentorQuestion = false;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
  const previousKey = localStorage.getItem('gemini_api_key');
  if (previousKey && !sessionStorage.getItem('gemini_chat_api_key')) {
    sessionStorage.setItem('gemini_chat_api_key', previousKey);
  }
  localStorage.removeItem('gemini_api_key');
  updateApiKeyDisplay();
});

// Tab Switcher
function switchTab(tabId) {
  currentTab = tabId;

  document.querySelectorAll('.view-tab').forEach(sec => sec.classList.remove('active'));
  const activeSection = document.getElementById(`view-${tabId}`);
  if (activeSection) activeSection.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.className = "nav-btn px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-2 text-slate-400 hover:text-white hover:bg-slate-800";
  });
  const currentNav = document.getElementById(`nav-${tabId}`);
  if (currentNav) {
    currentNav.className = "nav-btn px-4 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all flex items-center gap-2 text-indigo-300 bg-indigo-600/20 border border-indigo-500/30";
  }

  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) mobileMenu.classList.add('hidden');
}

function toggleMobileMenu() {
  const mobileMenu = document.getElementById('mobileMenu');
  if (mobileMenu) mobileMenu.classList.toggle('hidden');
}

// ========================================================
// API CONFIG / BACKEND PROXY
// ========================================================
function openApiKeyModal() {
  const input = document.getElementById('apiKeyInput');
  if (input) input.value = getMentorApiKey();
  const modal = document.getElementById('apiKeyModal');
  if (modal) modal.classList.remove('hidden');
}

function closeApiKeyModal() {
  pendingMentorQuestion = false;
  const modal = document.getElementById('apiKeyModal');
  if (modal) modal.classList.add('hidden');
}

function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key) {
    showAppNotice('Enter your Gemini API key to enable mentor chat, or choose “Continue without chat.”');
    return;
  }

  sessionStorage.setItem('gemini_chat_api_key', key);
  const resumePendingQuestion = pendingMentorQuestion;
  pendingMentorQuestion = false;
  updateApiKeyDisplay();
  closeApiKeyModal();
  clearAppNotice();
  if (resumePendingQuestion) void askMentorFollowup();
}

function skipMentorChat() {
  pendingMentorQuestion = false;
  closeApiKeyModal();
  clearAppNotice();
}

function removeApiKey() {
  sessionStorage.removeItem('gemini_chat_api_key');
  pendingMentorQuestion = false;
  const input = document.getElementById('apiKeyInput');
  if (input) input.value = '';
  updateApiKeyDisplay();
  closeApiKeyModal();
  showAppNotice('Your mentor chat key was removed from this browser session.');
}

function getMentorApiKey() {
  return sessionStorage.getItem('gemini_chat_api_key') || '';
}

function updateApiKeyDisplay() {
  const btnText = document.getElementById('apiKeyBtnText');
  if (!btnText) return;

  if (getMentorApiKey()) {
    btnText.innerText = 'Mentor Key Set';
    btnText.classList.add('text-emerald-400');
  } else {
    btnText.innerText = 'Mentor Key (Optional)';
    btnText.classList.remove('text-emerald-400');
  }
}

async function callGeminiWithUserKey(promptText) {
  const apiKey = getMentorApiKey();
  if (!apiKey) {
    throw new Error('Add your own Gemini API key to use mentor chat.');
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({ contents: [{ parts: [{ text: promptText }] }] })
    }
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 429) {
      throw new Error('Your Gemini key has reached its quota. Check its limits in Google AI Studio or try again after the quota resets.');
    }
    if ([502, 503, 504].includes(response.status)) {
      throw new Error('Gemini is temporarily busy. Please try the mentor chat again in a moment.');
    }
    throw new Error(data.error?.message || `Mentor chat failed (${response.status}). Check your Gemini API key and try again.`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini did not return a chat response. Please try again.');
  }
  return text;
}

function showAppNotice(message) {
  const notice = document.getElementById('appNotice');
  if (!notice) return;

  notice.innerText = message;
  notice.classList.remove('hidden');
}

function clearAppNotice() {
  const notice = document.getElementById('appNotice');
  if (!notice) return;

  notice.innerText = '';
  notice.classList.add('hidden');
}

function getAiErrorMessage(error, data) {
  if (data.code === 'GEMINI_QUOTA_EXCEEDED') {
    return 'Gemini has temporarily exhausted the configured API key’s quota. Please try again after the quota resets, or ask the key owner to review limits and billing in Google AI Studio. Repeated retries will not restore exhausted quota.';
  }

  if (error.status === 429) {
    return data.error || 'This app is receiving too many requests. Please wait a little before trying again.';
  }

  if (error.status === 503 || error.status === 502 || error.status === 504) {
    return 'Gemini is temporarily busy. Please try again in a moment.';
  }

  return data.error || `AI request failed (${error.status}). Please try again.`;
}

async function callGemini(promptText, isJson = false) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText, isJson })
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok) {
      clearAppNotice();
      return data.text;
    }

    const isTemporaryUpstreamError =
      data.code === 'GEMINI_UPSTREAM_ERROR' &&
      [502, 503, 504].includes(response.status);
    if (isTemporaryUpstreamError && attempt < 2) {
      const retryAfter = Number(response.headers.get('Retry-After'));
      const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, 5000)
        : 1000 * (2 ** attempt);
      await new Promise(resolve => setTimeout(resolve, delayMs));
      continue;
    }

    const error = new Error(getAiErrorMessage(response, data));
    error.status = response.status;
    throw error;
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function parseGeminiJson(rawText) {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('No response returned by Gemini.');
  }

  let cleaned = rawText.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '');

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error('Gemini returned invalid JSON. Please try again.');
  }
}

// Clean markdown text for simple rendering
function formatMarkdown(text) {
  if (!text) return '';

  const sanitized = escapeHtml(text);
  return sanitized
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '<br/><br/>')
    .replace(/\n/g, '<br/>');
}

// ========================================================
// 1. FULL ECOSYSTEM EVALUATION
// ========================================================
function prefillEcosystemDemo() {
  document.getElementById('ecoPortfolioUrl').value = 'https://alexchen-dev.vercel.app';
  document.getElementById('ecoGithubUrl').value = 'https://github.com/alexchen';
  document.getElementById('ecoLinkedinUrl').value = 'https://linkedin.com/in/alexchen-software';
  document.getElementById('ecoTargetTier').value = 'Tier-1 Product (FAANG, Microsoft, Uber)';
  document.getElementById('ecoTargetRole').value = 'SDE-1 Full Stack / Backend';
  document.getElementById('ecoContext').value = 'Built a Real-Time Collaborative Canvas (Next.js, WebSockets, Redis pub/sub) and an E-commerce microservice (Node, Docker, PostgreSQL). 1 year internship experience.';
}

async function runEcosystemAudit(e) {
  e.preventDefault();

  const portfolio = document.getElementById('ecoPortfolioUrl').value;
  const github = document.getElementById('ecoGithubUrl').value;
  const linkedin = document.getElementById('ecoLinkedinUrl').value;
  const tier = document.getElementById('ecoTargetTier').value;
  const role = document.getElementById('ecoTargetRole').value;
  const context = document.getElementById('ecoContext').value;

  const emptyState = document.getElementById('ecoEmptyState');
  const loadingState = document.getElementById('ecoLoadingState');
  const reportCard = document.getElementById('ecoReportCard');
  const submitBtn = document.getElementById('ecoSubmitBtn');

  emptyState.classList.add('hidden');
  reportCard.classList.add('hidden');
  loadingState.classList.remove('hidden');
  if (submitBtn) submitBtn.disabled = true;

  const prompt = `
You are a Principal Tech Recruiter and Engineering Manager evaluating candidates for: ${tier}.
The candidate is applying for: ${role}.

Links & Details:
- Portfolio: ${portfolio}
- GitHub: ${github}
- LinkedIn: ${linkedin || 'Not provided'}
- Projects & Context: ${context}

Conduct a brutal, realistic MNC audit. Provide your output strictly as a JSON object with this exact structure:
{
  "readinessScore": number (0 to 100),
  "verdict": "string (Short punchy verdict like: 'Borderline Shortlist', 'Immediate Filter Out', or 'Strong Tech Hire')",
  "executiveSummary": "string (2-3 sentences explaining recruiter immediate impression)",
  "scores": {
    "uxRecruiter": number (0 to 25),
    "projectDepth": number (0 to 25),
    "techAlignment": number (0 to 25),
    "metricsProof": number (0 to 25)
  },
  "redFlags": ["flag 1", "flag 2", "flag 3"],
  "standouts": ["standout 1", "standout 2"],
  "roadmap30Days": [
    {"dayRange": "Days 1-7", "action": "description"},
    {"dayRange": "Days 8-15", "action": "description"},
    {"dayRange": "Days 16-30", "action": "description"}
  ]
}
`;

  try {
    const rawResult = await callGemini(prompt, true);
    const parsed = parseGeminiJson(rawResult);

    latestAuditContext = { candidate: { portfolio, github, role, tier, context }, audit: parsed };

    document.getElementById('reportVerdict').innerText = parsed.verdict;
    document.getElementById('reportSummary').innerText = parsed.executiveSummary;
    document.getElementById('reportScore').innerText = parsed.readinessScore;

    document.getElementById('scoreUx').innerText = `${parsed.scores?.uxRecruiter || 15}/25`;
    document.getElementById('scoreDepth').innerText = `${parsed.scores?.projectDepth || 14}/25`;
    document.getElementById('scoreTech').innerText = `${parsed.scores?.techAlignment || 16}/25`;
    document.getElementById('scoreProof').innerText = `${parsed.scores?.metricsProof || 12}/25`;

    const flagsList = document.getElementById('reportRedFlags');
    flagsList.innerHTML = (parsed.redFlags || []).map(f => `<li>${escapeHtml(f)}</li>`).join('');

    const standoutsList = document.getElementById('reportStandouts');
    standoutsList.innerHTML = (parsed.standouts || []).map(s => `<li>${escapeHtml(s)}</li>`).join('');

    const roadmapDiv = document.getElementById('reportRoadmap');
    roadmapDiv.innerHTML = (parsed.roadmap30Days || []).map(step => `
      <div class="border-l-2 border-indigo-500 pl-3 py-1">
        <strong class="text-indigo-400 block">${escapeHtml(step.dayRange)}:</strong>
        <p class="text-slate-400">${escapeHtml(step.action)}</p>
      </div>
    `).join('');

    loadingState.classList.add('hidden');
    reportCard.classList.remove('hidden');

  } catch (err) {
    loadingState.classList.add('hidden');
    emptyState.classList.remove('hidden');
    showAppNotice(err.message || 'Error conducting audit.');
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

// Follow-up Chat Mentor
async function askMentorFollowup() {
  const input = document.getElementById('mentorQuestionInput');
  const query = input.value.trim();
  if (!query) return;

  if (!getMentorApiKey()) {
    pendingMentorQuestion = true;
    openApiKeyModal();
    return;
  }

  const chatContainer = document.getElementById('mentorChatHistory');
  const safeQuery = escapeHtml(query);
  chatContainer.innerHTML += `
    <div class="p-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-right">
      <span class="font-bold text-slate-400 block mb-0.5 text-[10px]">You:</span>
      ${safeQuery}
    </div>
  `;
  input.value = '';
  chatContainer.scrollTop = chatContainer.scrollHeight;

  const prompt = `
You are the MNC Engineering Manager mentoring this candidate.
Audit Context: ${JSON.stringify(latestAuditContext || {})}
Candidate Question: "${query}"

Give actionable, concrete, senior-level advice in 2-3 concise paragraphs. Format with clean text and bullet points.
`;

  try {
  const reply = await callGeminiWithUserKey(prompt);
    chatContainer.innerHTML += `
      <div class="p-2.5 rounded-lg bg-indigo-950/40 border border-indigo-900/60 text-slate-200">
        <span class="font-bold text-indigo-300 block mb-0.5 text-[10px]">MNC Hiring Mentor:</span>
        ${formatMarkdown(reply)}
      </div>
    `;
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } catch (err) {
    showAppNotice(err.message);
  }
}

// ========================================================
// 2. GITHUB REST API SYNC & CODEBASE AUDIT
// ========================================================
function prefillGithubDemo() {
  document.getElementById('githubUsernameInput').value = 'shadcn';
}

async function fetchGitHubLiveData() {
  const username = document.getElementById('githubUsernameInput').value.trim();
  if (!username) {
    showAppNotice('Please enter a GitHub username.');
    return;
  }

  const container = document.getElementById('githubDataContainer');
  const auditContent = document.getElementById('ghAiAuditContent');
  
  try {
    const userRes = await fetch(`https://api.github.com/users/${username}`);
    if (userRes.status === 403) {
      throw new Error("GitHub public rate limit reached. Please wait a few minutes or try again later.");
    }
    if (!userRes.ok) throw new Error(`GitHub user not found (${userRes.status})`);
    const userData = await userRes.json();

    const reposRes = await fetch(`https://api.github.com/users/${username}/repos?sort=updated&per_page=6`);
    if (reposRes.status === 403) {
      throw new Error("GitHub public rate limit reached. Please wait a few minutes or try again later.");
    }
    if (!reposRes.ok) throw new Error(`GitHub repos could not be fetched (${reposRes.status})`);

    const reposData = await reposRes.json();
    if (!Array.isArray(reposData)) {
      throw new Error('GitHub returned malformed repository data.');
    }

    document.getElementById('ghAvatar').src = userData.avatar_url;
    document.getElementById('ghName').innerText = userData.name || userData.login;
    document.getElementById('ghBio').innerText = userData.bio || 'No public bio provided.';
    document.getElementById('ghReposCount').innerText = userData.public_repos;
    document.getElementById('ghFollowersCount').innerText = userData.followers;

    let totalStars = 0;
    const repoListEl = document.getElementById('ghRepoList');
    repoListEl.innerHTML = '';

    reposData.forEach(repo => {
      totalStars += repo.stargazers_count || 0;
      const repoName = escapeHtml(repo.name || 'Untitled repository');
      const repoDescription = escapeHtml(repo.description || 'No description provided');
      const repoLanguage = escapeHtml(repo.language || 'Code');
      const repoUrl = escapeHtml(repo.html_url || '#');
      repoListEl.innerHTML += `
        <div class="bg-slate-950/70 p-3 rounded-xl border border-slate-800">
          <a href="${repoUrl}" target="_blank" rel="noopener noreferrer" class="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-1.5 truncate">
            <i class="fa-regular fa-folder"></i> ${repoName}
          </a>
          <p class="text-[11px] text-slate-400 line-clamp-2 mt-1">${repoDescription}</p>
          <div class="flex items-center gap-3 mt-2 text-[10px] text-slate-500 font-mono">
            <span>${repoLanguage}</span>
            <span>★ ${repo.stargazers_count || 0}</span>
            <span>⑂ ${repo.forks_count || 0}</span>
          </div>
        </div>
      `;
    });

    document.getElementById('ghStarsCount').innerText = totalStars;
    container.classList.remove('hidden');

    auditContent.innerHTML = `<p class="text-slate-400 italic"><i class="fa-solid fa-spinner animate-spin"></i> Running MNC Code Depth Audit on repos...</p>`;

    const aiPrompt = `
Analyze this GitHub candidate for high-bar MNC software engineering standards:
Username: ${username}
Bio: ${userData.bio}
Public Repos: ${userData.public_repos}
Stars: ${totalStars}
Top Repos: ${reposData.map(r => `${r.name} (${r.language}):${r.description || 'no desc'}`).join('; ')}

Audit:
1. Are these repositories tutorial clones (weather apps, simple todos, clone repos) or do they demonstrate enterprise engineering?
2. What concrete architectural elements are missing (e.g., CI/CD tests, Docker, database schemas)?
3. Give 3 precise actions to turn this GitHub into a Tier-1 recruitment magnet.
Format with clean bullet points.
`;

    const aiAnalysis = await callGemini(aiPrompt, false);
    auditContent.innerHTML = formatMarkdown(aiAnalysis);

  } catch (err) {
    showAppNotice(err.message || 'Error fetching GitHub data.');
  }
}

// ========================================================
// 3. RESUME FLUFF DETECTOR & STAR REWRITER
// ========================================================
function prefillResumeDemo() {
  document.getElementById('resumeInputText').value = 
`• Created an e-commerce website using MERN stack with login and shopping cart.
• Responsible for building backend APIs and integrating MongoDB database.
• Worked with team to fix bugs and improve website look and feel.
• Developed a chat application using socket.io with responsive design.`;
}

async function analyzeResumeFluff() {
  const text = document.getElementById('resumeInputText').value.trim();
  if (!text) {
    showAppNotice('Please enter your resume bullets or project descriptions.');
    return;
  }

  const outputDiv = document.getElementById('resumeAnalysisOutput');
  outputDiv.innerHTML = `<div class="text-center py-8 text-amber-400"><i class="fa-solid fa-circle-notch animate-spin text-xl"></i><p class="mt-2">Auditing for passive fluff & drafting STAR rewrites...</p></div>`;

  const prompt = `
You are a Staff Technical Recruiter at an MNC.
Analyze these resume project bullets:
"""
${text}
"""

Provide:
1. **Fluff & Passive Phrasing Warnings**: Point out vague words ("responsible for", "created", "worked on", lacking scale).
2. **Enterprise STAR Method Rewrites**: Rewrite each bullet with quantified metrics, architectural depth (e.g. latency, throughput, scale, tests), and strong action verbs.
3. **Interview Trap Questions**: 2 questions a senior engineer will ask based on these claims to test if the candidate actually built it.
`;

  try {
    const analysis = await callGemini(prompt, false);
    outputDiv.innerHTML = formatMarkdown(analysis);
  } catch (err) {
    showAppNotice(err.message);
    outputDiv.innerHTML = `<p class="text-rose-400">${escapeHtml(err.message)}</p>`;
  }
}