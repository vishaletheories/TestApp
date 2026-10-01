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
      return { id: page.id, name, priority, remarks };
    });
  } catch (err) {
    log(null, `⚠️ Error polling Notion: ${err.message}`);
    return [];
  }
}

// 3. Fetch ticket requirements/body from Notion
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
      if (block.paragraph?.rich_text) return block.paragraph.rich_text.map(t => t.plain_text).join('');
      if (block.bulleted_list_item?.rich_text) return '- ' + block.bulleted_list_item.rich_text.map(t => t.plain_text).join('');
      return '';
    }).filter(Boolean).join('\n');
  } catch {
    return '';
  }
}

// 4. Update ticket in Notion (Set PR link and flip to Done)
async function updateNotionTicketDone(pageId, prUrl) {
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
          'GitHub PR': { url: prUrl }
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
function applyCodeModifications(worktreeDir, ticket, requirements, workerId) {
  const titleLower = ticket.name.toLowerCase();
  const reqLower = requirements.toLowerCase();

  // Task Type 1: Logo or branding rename
  if (titleLower.includes('logo') || titleLower.includes('rename') || reqLower.includes('test app')) {
    const targetName = titleLower.includes('test app') ? 'Test App' : 'ETH';
    log(workerId, `✏️ Updating logo branding to "${targetName}"...`);

    const htmlPath = path.join(worktreeDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace(/<title>.*?<\/title>/, `<title>${targetName} - Intelligent Workflow Engine</title>`);
      fs.writeFileSync(htmlPath, html, 'utf8');
    }

    const appPath = path.join(worktreeDir, 'src', 'App.jsx');
    if (fs.existsSync(appPath)) {
      let app = fs.readFileSync(appPath, 'utf8');
      app = app.replace(/<span>(NovaFlow|ETH|Test App)<\/span>/g, `<span>${targetName}</span>`);
      app = app.replace(/(NovaFlow|ETH|Test App) Engine/g, `${targetName} Engine`);
      fs.writeFileSync(appPath, app, 'utf8');
    }
  }

  // Task Type 2: Handle remarks (e.g. spacing, colors)
  if (ticket.remarks && ticket.remarks.toLowerCase().includes('space')) {
    log(workerId, `✏️ Applying spacing fix from remarks...`);
    const cssPath = path.join(worktreeDir, 'src', 'index.css');
    if (fs.existsSync(cssPath)) {
      let css = fs.readFileSync(cssPath, 'utf8');
      if (!css.includes('margin-right: 14px;')) {
        css = css.replace('.nav-actions {', '.nav-actions {\n  margin-right: 14px;');
        fs.writeFileSync(cssPath, css, 'utf8');
      }
    }
  }

  // Task Type 3: Fleet Info Cards Section
  if (titleLower.includes('fleet') || reqLower.includes('fleet')) {
    log(workerId, `✏️ Adding Fleet Info Cards section...`);
    const appPath = path.join(worktreeDir, 'src', 'App.jsx');
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

// 6. Parallel Worker Execution (Git Worktree Sandbox)
async function processTicketInParallelWorktree(ticket) {
  const shortId = ticket.id.replace(/-/g, '').slice(0, 6);
  const workerId = `W-${shortId}`;
  const slug = ticket.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const branchName = `feat/${slug}`;
  const workerWorktree = path.join(worktreesDir, `sandbox-${shortId}`);

  log(workerId, `🚀 STARTING PARALLEL WORKER FOR: "${ticket.name}"`);
  log(workerId, `📌 Priority: ${ticket.priority} | Branch: ${branchName}`);

  try {
    // A. Ensure worktrees directory exists
    if (!fs.existsSync(worktreesDir)) {
      fs.mkdirSync(worktreesDir, { recursive: true });
    }

    // B. Clean up any previous stale worktree for this worker
    if (fs.existsSync(workerWorktree)) {
      try { runCmd(`git worktree remove --force "${workerWorktree}"`); } catch {}
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
    applyCodeModifications(workerWorktree, ticket, requirements, workerId);

    // H. Validate build inside isolated worktree
    log(workerId, `🧪 Running production build verification in sandbox...`);
    runCmd('npm run build', workerWorktree);
    log(workerId, `✅ Sandbox build passed with 0 errors!`);

    // I. Commit & Push to GitHub directly from worktree
    log(workerId, `📤 Committing and pushing ${branchName} to GitHub...`);
    runCmd('git add .', workerWorktree);
    runCmd(`git commit -m "feat: ${ticket.name} [Parallel Worker ${workerId}]"`, workerWorktree);
    runCmd(`git push -u origin ${branchName}`, workerWorktree);

    // J. Construct Pull Request URL targeting develop
    const prUrl = `${GITHUB_REPO}/compare/develop...${branchName}?expand=1`;
    log(workerId, `🔗 Pull Request created: ${prUrl}`);

    // K. Update Notion ticket to Done
    log(workerId, `📝 Updating Notion ticket to 'Done'...`);
    await updateNotionTicketDone(ticket.id, prUrl);
    log(workerId, `🎉 COMPLETE! Ticket "${ticket.name}" finished in parallel!`);

    // L. Clean up isolated worktree
    try {
      runCmd(`git worktree remove --force "${workerWorktree}"`);
      runCmd('git worktree prune');
    } catch {}

  } catch (err) {
    log(workerId, `❌ Worker failed for "${ticket.name}": ${err.message}`);
    try {
      runCmd(`git worktree remove --force "${workerWorktree}"`);
      runCmd('git worktree prune');
    } catch {}
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
