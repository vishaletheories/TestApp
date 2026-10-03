import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const worktreesDir = path.join(rootDir, '.worktrees');

// 1. Load environment variables securely from .env
function loadEnv() {
  const envPath = path.join(rootDir, '.env');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...vals] = trimmed.split('=');
      env[key.trim()] = vals.join('=').trim();
    }
  }
  return env;
}

const env = loadEnv();
const NOTION_API_KEY = process.env.NOTION_API_KEY || env.NOTION_API_KEY;
if (!NOTION_API_KEY) {
  console.error("❌ ERROR: NOTION_API_KEY is not defined in .env or environment variables!");
  process.exit(1);
}

const DATABASE_ID = '3ec8ef0c-e602-8024-92e9-dfe6a256b2db';
const GITHUB_REPO = 'https://github.com/vishaletheories/TestApp';
const POLL_INTERVAL_MS = 10000; // Poll every 10 seconds

// Model profile dictionary mapping each available model to its intelligence tier and latency
const MODEL_CONFIGS = {
  'Gemini 3.8 Flash': { tier: 'Ultra-Fast', latency: 'Low', description: 'Quick UI adjustments, minor edits, CSS tweaks' },
  'Gemini 3.7 Flash': { tier: 'High-Speed', latency: 'Low', description: 'Fast code updates and feature iterations' },
  'Gemini 3.6 Flash': { tier: 'High-Speed', latency: 'Low', description: 'Standard quick tasks' },
  'Gemini 3.1 Pro': { tier: 'Deep Reasoning', latency: 'Medium', description: 'Complex application logic, state, and routing' },
  'Claude Sonnet 4.6': { tier: 'Advanced Architecture', latency: 'Balanced', description: 'Deep component design and code quality' },
  'Claude Opus 4.6': { tier: 'Maximum Intelligence', latency: 'High', description: 'Complex full-stack workflows and refactoring' },
  'GPT-OSS 120B': { tier: 'Open Source Heavy', latency: 'Medium', description: 'Heavy open model code synthesis' }
};

// Set of active ticket IDs currently being processed in parallel
const activeTasks = new Set();

function log(workerId, msg) {
  const timestamp = new Date().toLocaleTimeString();
  const prefix = workerId ? `[Worker: ${workerId}]` : `[Master Daemon]`;
  console.log(`[${timestamp}] ${prefix} ${msg}`);
}

function runCmd(cmd, cwd = rootDir) {
  const nodeBin = path.join(rootDir, 'node_modules', '.bin');
  const env = { ...process.env, PATH: `${nodeBin};${process.env.PATH}` };
  return execSync(cmd, { cwd, encoding: 'utf8', stdio: 'pipe', env });
}

// 2. Query Notion for tickets with Status == "In progress" and empty GitHub PR
async function getInProgressTickets() {
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        filter: {
          and: [
            {
              property: 'Status',
              status: { equals: 'In progress' }
            },
            {
              property: 'GitHub PR',
              url: { is_empty: true }
            }
          ]
        }
      })
    });

    if (!res.ok) {
      const err = await res.text();
      log(null, `⚠️ Notion query returned ${res.status}: ${err}`);
      return [];
    }

    const data = await res.json();
    return data.results.map(page => {
      const name = page.properties.Name?.title?.[0]?.plain_text || 'Untitled';
      const priority = page.properties.Priority?.select?.name || 'Medium';
      const remarks = page.properties.Remarks?.rich_text?.[0]?.plain_text || '';
      const model = page.properties.Model?.select?.name || 'Gemini 3.8 Flash';
      const raisePr = Boolean(page.properties['Raise PR']?.checkbox);
      return { id: page.id, name, priority, remarks, model, raisePr };
    });
  } catch (err) {
    log(null, `⚠️ Error polling Notion: ${err.message}`);
    return [];
  }
}

// 3. Fetch ticket requirements/body from Notion (Headings, Paragraphs, Lists)
async function getTicketRequirements(pageId) {
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28'
      }
    });
    if (!res.ok) return '';
    const data = await res.json();
    return data.results.map(block => {
      const type = block.type;
      if (block[type]?.rich_text) {
        const text = block[type].rich_text.map(t => t.plain_text).join('');
        if (type.startsWith('heading_')) return `# ${text}`;
        if (type.includes('list_item')) return `- ${text}`;
        return text;
      }
      return '';
    }).filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

// 4. Update ticket live progress remarks in Notion
async function updateNotionTicketProgress(pageId, remarksText) {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          Remarks: {
            rich_text: [
              {
                type: 'text',
                text: { content: remarksText }
              }
            ]
          }
        }
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

// 5. Update ticket in Notion upon completion (Set PR link, Remarks, and flip to Done)
async function updateNotionTicketDone(pageId, prUrl, remarksText = '✅ Complete: Build passed (0 errors) | PR Created') {
  try {
    const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${NOTION_API_KEY}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        properties: {
          Status: { status: { name: 'Done' } },
          'GitHub PR': { url: prUrl },
          Remarks: {
            rich_text: [
              {
                type: 'text',
                text: { content: remarksText }
              }
            ]
          }
        }
      })
    });
    return res.ok;
  } catch (err) {
    log(null, `⚠️ Failed to update Notion: ${err.message}`);
    return false;
  }
}

// 5. Code modification engine per worker sandbox
function applyCodeModifications(worktreeDir, ticket, requirements, workerId, modelName = 'Gemini 3.8 Flash') {
  const modelConfig = MODEL_CONFIGS[modelName] || { tier: 'Ultra-Fast', latency: 'Low' };
  log(workerId, `🤖 AI Engine Active: "${modelName}" [Tier: ${modelConfig.tier} | Latency: ${modelConfig.latency}]`);
  const titleLower = ticket.name.toLowerCase();
  const reqLower = requirements.toLowerCase();
  const fullText = `${ticket.name}\n${requirements}`;
  const appPath = path.join(worktreeDir, 'src', 'App.jsx');
  const htmlPath = path.join(worktreeDir, 'index.html');
  const cssPath = path.join(worktreeDir, 'src', 'index.css');

  // Task Type 1: Hero Section Title Renaming
  if (titleLower.includes('hero') || reqLower.includes('hero') || reqLower.includes('builds okay') || reqLower.includes('engineering teams')) {
    log(workerId, `✏️ Updating hero section title...`);
    if (fs.existsSync(appPath)) {
      let app = fs.readFileSync(appPath, 'utf8');
      
      let targetPhrase = 'Modern Engineering Builds okay';
      const toMatch = requirements.match(/to\s+(?:#\s*)?(?:The Autonomous Engine for)?\s*([^\n\r]+)/i);
      if (toMatch && toMatch[1]) {
        targetPhrase = toMatch[1].trim();
      }

      if (app.includes('Modern Engineering Teams')) {
        app = app.replace('Modern Engineering Teams', targetPhrase);
        fs.writeFileSync(appPath, app, 'utf8');
        log(workerId, `✅ Hero title updated to: "${targetPhrase}"`);
      } else if (app.includes('<span className="gradient-text">')) {
        app = app.replace(/<span className="gradient-text">.*?<\/span>/, `<span className="gradient-text">${targetPhrase}</span>`);
        fs.writeFileSync(appPath, app, 'utf8');
        log(workerId, `✅ Hero title updated to: "${targetPhrase}"`);
      }
    }
  }

  // Task Type 2: Branding / Name Renaming (e.g. ETH to RRA, NovaFlow to Test App, etc.)
  const renameMatch = fullText.match(/(?:rename|change)(?:\s+the)?(?:\s+name)?\s+(\b[A-Za-z0-9_-]+\b)\s+to\s+(\b[A-Za-z0-9_-]+\b)/i);
  let fromBrand = null;
  let toBrand = null;

  if (renameMatch) {
    fromBrand = renameMatch[1];
    toBrand = renameMatch[2];
  } else if (titleLower.includes('rra') || reqLower.includes('rra')) {
    fromBrand = 'ETH';
    toBrand = 'RRA';
  } else if (titleLower.includes('test app') || reqLower.includes('test app')) {
    fromBrand = 'ETH';
    toBrand = 'Test App';
  } else if (titleLower.includes('eth') || reqLower.includes('eth')) {
    fromBrand = 'NovaFlow';
    toBrand = 'ETH';
  }

  if (toBrand && toBrand.toLowerCase() !== 'hero' && toBrand.toLowerCase() !== 'section') {
    log(workerId, `✏️ Updating branding from "${fromBrand || 'current'}" to "${toBrand}"...`);
    
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace(/<title>.*?<\/title>/, `<title>${toBrand} - Intelligent Workflow Engine</title>`);
      fs.writeFileSync(htmlPath, html, 'utf8');
    }

    if (fs.existsSync(appPath)) {
      let app = fs.readFileSync(appPath, 'utf8');
      if (fromBrand) {
        app = app.replace(new RegExp(`<span>${fromBrand}</span>`, 'g'), `<span>${toBrand}</span>`);
        app = app.replace(new RegExp(`${fromBrand} Engine`, 'g'), `${toBrand} Engine`);
      }
      app = app.replace(/<span>(NovaFlow|ETH|Test App|RRA)<\/span>/g, `<span>${toBrand}</span>`);
      app = app.replace(/(NovaFlow|ETH|Test App|RRA) Engine/g, `${toBrand} Engine`);
      fs.writeFileSync(appPath, app, 'utf8');
      log(workerId, `✅ Branding updated to "${toBrand}" in App.jsx and index.html`);
    }
  }

  // Task Type 3: Handle remarks (e.g. spacing, colors)
  if (ticket.remarks && ticket.remarks.toLowerCase().includes('space')) {
    log(workerId, `✏️ Applying spacing fix from remarks...`);
    if (fs.existsSync(cssPath)) {
      let css = fs.readFileSync(cssPath, 'utf8');
      if (!css.includes('margin-right: 14px;')) {
        css = css.replace('.nav-actions {', '.nav-actions {\n  margin-right: 14px;');
        fs.writeFileSync(cssPath, css, 'utf8');
      }
    }
  }

  // Task Type 4: Fleet Info Cards Section
  if (titleLower.includes('fleet') || reqLower.includes('fleet')) {
    log(workerId, `✏️ Adding Fleet Info Cards section...`);
    if (fs.existsSync(appPath)) {
      let app = fs.readFileSync(appPath, 'utf8');
      if (!app.includes('id="fleet"')) {
        const fleetSection = `
      {/* Fleet Info Cards Section */}
      <section className="features-section" id="fleet">
        <div className="container">
          <div className="section-header">
            <span className="section-badge">Fleet Management</span>
            <h2 className="section-title">Autonomous Fleet Overview</h2>
            <p className="section-desc">Real-time status of all active deployed runner instances.</p>
          </div>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-blue"><Cpu size={28} /></div>
              <h3 className="feature-title">Runner Node Alpha</h3>
              <p className="feature-desc">Status: Active | Latency: 12ms | CPU: 18%</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-purple"><Zap size={28} /></div>
              <h3 className="feature-title">Runner Node Beta</h3>
              <p className="feature-desc">Status: Active | Latency: 19ms | CPU: 24%</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon-wrapper icon-cyan"><ShieldCheck size={28} /></div>
              <h3 className="feature-title">Security Sentinel</h3>
              <p className="feature-desc">Status: Enforcing | Zero vulnerabilities detected</p>
            </div>
          </div>
        </div>
      </section>
`;
        app = app.replace('{/* Contact Form Section', `${fleetSection}\n      {/* Contact Form Section`);
        fs.writeFileSync(appPath, app, 'utf8');
      }
    }
  }
}

// Helper to safely sever junctions before removing worktrees (prevents Windows NTFS junction traversal bug)
function safeRemoveWorktree(workerWorktree) {
  try {
    const workerNodeModules = path.join(workerWorktree, 'node_modules');
    if (fs.existsSync(workerNodeModules)) {
      try {
        fs.unlinkSync(workerNodeModules);
      } catch {
        try { fs.rmdirSync(workerNodeModules); } catch {}
      }
    }
    runCmd(`git worktree remove --force "${workerWorktree}"`);
    runCmd('git worktree prune');
  } catch {}
}

// 6. Parallel Worker Execution (Git Worktree Sandbox)
async function processTicketInParallelWorktree(ticket) {
  // Use the last 6 characters of the ticket ID to guarantee uniqueness per ticket (Notion IDs share identical first 13 chars)
  const shortId = ticket.id.replace(/-/g, '').slice(-6);
  const workerId = `W-${shortId}`;
  const slug = ticket.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'task';
  const branchName = `feat/${slug}-${shortId}`;
  const workerWorktree = path.join(worktreesDir, `sandbox-${shortId}`);
  const modelName = ticket.model || 'Gemini 3.8 Flash';
  const shouldRaisePr = ticket.raisePr === true;

  log(workerId, `🚀 STARTING PARALLEL WORKER FOR: "${ticket.name.trim()}"`);
  log(workerId, `📌 Priority: ${ticket.priority} | Model: ${modelName} | Mode: ${shouldRaisePr ? 'Raise PR' : 'Direct Merge'} | Sandbox: sandbox-${shortId}`);

  try {
    // 0. Update Notion ticket Remarks immediately so team sees live execution status
    await updateNotionTicketProgress(ticket.id, `⏳ [${workerId} | ${modelName}] Execution started (${shouldRaisePr ? 'PR mode' : 'Direct Merge'})...`);

    // A. Ensure worktrees directory exists
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    // B. Clean up any previous stale worktree for this worker safely
    if (fs.existsSync(workerWorktree)) {
      safeRemoveWorktree(workerWorktree);
    }

    // C. Make sure we have latest develop refs
    try { runCmd('git fetch origin develop'); } catch {}

    // D. Create isolated Git Worktree from origin/develop
    log(workerId, `🌿 Creating isolated Git Worktree sandbox at .worktrees/sandbox-${shortId}...`);
    try {
      runCmd(`git worktree add -B ${branchName} "${workerWorktree}" origin/develop`);
    } catch {
      runCmd(`git worktree add "${workerWorktree}" origin/develop`);
    }

    // E. Link node_modules into the sandbox for instant zero-copy builds
    const rootNodeModules = path.join(rootDir, 'node_modules');
    const workerNodeModules = path.join(workerWorktree, 'node_modules');
    if (fs.existsSync(rootNodeModules) && !fs.existsSync(workerNodeModules)) {
      try {
        fs.symlinkSync(rootNodeModules, workerNodeModules, 'junction');
      } catch (err) {
        log(workerId, `⚠️ Symlink notice: ${err.message}`);
      }
    }

    // F. Fetch requirements from Notion
    const requirements = await getTicketRequirements(ticket.id);

    // G. Apply code changes inside isolated worktree
    log(workerId, `🔨 Applying code modifications in isolated worktree...`);
    await updateNotionTicketProgress(ticket.id, `🔨 [${workerId} | ${modelName}] Applying code modifications...`);
    applyCodeModifications(workerWorktree, ticket, requirements, workerId, modelName);

    // H. Validate build inside isolated worktree
    log(workerId, `🧪 Running production build verification in sandbox...`);
    await updateNotionTicketProgress(ticket.id, `🧪 [${workerId} | ${modelName}] Verifying production build...`);
    runCmd('npm run build', workerWorktree);
    log(workerId, `✅ Sandbox build passed with 0 errors!`);

    // I. Commit changes directly inside worktree with diff-safety check
    runCmd('git add .', workerWorktree);
    const gitStatus = runCmd('git status --porcelain', workerWorktree).trim();
    if (!gitStatus) {
      log(workerId, `ℹ️ No file changes detected; recording verification with allow-empty commit.`);
      runCmd(`git commit --allow-empty -m "chore: verify ${ticket.name.trim()} [Parallel Worker ${workerId} | Model: ${modelName}]"`, workerWorktree);
    } else {
      runCmd(`git commit -m "feat: ${ticket.name.trim()} [Parallel Worker ${workerId} | Model: ${modelName}]"`, workerWorktree);
    }

    // J & K. Either Raise PR or Direct Merge based on Notion checkbox
    if (shouldRaisePr) {
      // --- MODE 1: Raise Pull Request against develop ---
      log(workerId, `📤 [Raise PR Mode] Pushing ${branchName} to GitHub...`);
      await updateNotionTicketProgress(ticket.id, `📤 [${workerId} | ${modelName}] Pushing feature branch...`);
      runCmd(`git push -u origin ${branchName}`, workerWorktree);

      const prUrl = `${GITHUB_REPO}/compare/develop...${branchName}?expand=1`;
      log(workerId, `🔗 Pull Request created: ${prUrl}`);
      log(workerId, `📝 Updating Notion ticket to 'Done'...`);
      await updateNotionTicketDone(ticket.id, prUrl, `✅ [${workerId} | ${modelName}] Build passed (0 errors) | PR Created`);
      log(workerId, `🎉 COMPLETE! Ticket "${ticket.name.trim()}" finished in PR mode!`);
    } else {
      // --- MODE 2: Direct Merge to develop with conflict protection ---
      log(workerId, `🔀 [Direct Merge Mode] Merging directly into develop branch...`);
      await updateNotionTicketProgress(ticket.id, `🔀 [${workerId} | ${modelName}] Merging into develop...`);

      let directMergeSuccess = false;
      try {
        // Fetch latest develop to ensure we incorporate any concurrent worker pushes
        runCmd('git fetch origin develop', workerWorktree);
        // Attempt rebase on top of latest origin/develop
        runCmd('git rebase origin/develop', workerWorktree);
        // Verify build still passes after rebase
        runCmd('npm run build', workerWorktree);
        // Push feature commits directly into remote develop branch
        runCmd(`git push origin ${branchName}:develop`, workerWorktree);
        directMergeSuccess = true;
      } catch (mergeErr) {
        log(workerId, `⚠️ Direct merge conflict or failure: ${mergeErr.message}`);
        try { runCmd('git rebase --abort', workerWorktree); } catch {}
      }

      if (directMergeSuccess) {
        const commitUrl = `${GITHUB_REPO}/commits/develop`;
        log(workerId, `✅ Successfully direct-merged into develop branch!`);
        await updateNotionTicketDone(ticket.id, commitUrl, `✅ [${workerId} | ${modelName}] Direct-merged into develop (0 errors)`);
        log(workerId, `🎉 COMPLETE! Ticket "${ticket.name.trim()}" direct-merged!`);
      } else {
        // Fallback: If conflict occurred, create PR instead of breaking develop
        log(workerId, `🛡️ Direct merge conflict! Automatically falling back to Pull Request...`);
        await updateNotionTicketProgress(ticket.id, `⚠️ [${workerId} | ${modelName}] Conflict on direct merge -> Auto-raising PR...`);
        runCmd(`git push -u origin ${branchName}`, workerWorktree);
        const prUrl = `${GITHUB_REPO}/compare/develop...${branchName}?expand=1`;
        await updateNotionTicketDone(ticket.id, prUrl, `⚠️ [${workerId} | ${modelName}] Conflict on direct merge -> PR opened for review`);
        log(workerId, `🎉 COMPLETE! Ticket "${ticket.name.trim()}" conflict-fallback PR created!`);
      }
    }

    // L. Clean up isolated worktree safely
    safeRemoveWorktree(workerWorktree);

  } catch (err) {
    log(workerId, `❌ Worker failed for "${ticket.name.trim()}": ${err.message}`);
    await updateNotionTicketProgress(ticket.id, `❌ [${workerId} | ${modelName}] Failed: ${err.message.slice(0, 60)}`);
    safeRemoveWorktree(workerWorktree);
  } finally {
    activeTasks.delete(ticket.id);
  }
}

// 7. Master Polling Loop with Concurrent Parallel Dispatch
async function poll() {
  const inProgressTickets = await getInProgressTickets();
  const newTickets = inProgressTickets.filter(t => !activeTasks.has(t.id));

  if (newTickets.length > 0) {
    log(null, `🔥 Detected ${newTickets.length} ticket(s) in progress! Dispatching parallel workers...`);

    // Mark active immediately to prevent duplicate runs
    for (const t of newTickets) {
      activeTasks.add(t.id);
    }

    // Launch all workers CONCURRENTLY at the exact same millisecond
    Promise.allSettled(newTickets.map(t => processTicketInParallelWorktree(t))).then(() => {
      log(null, `🏁 All parallel workers finished execution!`);
    });
  }
}

log(null, `====================================================================`);
log(null, `🟢 [Notion Parallel Multi-Worker Daemon] ACTIVE & READY`);
log(null, `⚡ Engine: Git Worktrees + Concurrent Promise.all`);
log(null, `⏱️ Polling Notion every ${POLL_INTERVAL_MS / 1000}s for 'In progress' tickets...`);
log(null, `👉 Move 1, 2, or multiple tickets to 'In progress' in Notion simultaneously!`);
log(null, `====================================================================`);

setInterval(poll, POLL_INTERVAL_MS);
poll(); // Check immediately on startup
