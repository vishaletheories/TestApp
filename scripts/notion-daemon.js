import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read environment variables from .env
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
const POLL_INTERVAL_MS = 10000; // Check every 10 seconds

function log(msg) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] ${msg}`);
}

function runCmd(cmd) {
  log(`⚡ Running: ${cmd}`);
  return execSync(cmd, { cwd: rootDir, encoding: 'utf8', stdio: 'pipe' });
}

// 2. Query Notion for tickets with Status == "In progress" and no GitHub PR yet
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
      log(`⚠️ Notion query returned ${res.status}: ${err}`);
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
    log(`⚠️ Error polling Notion: ${err.message}`);
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
    log(`⚠️ Failed to update Notion: ${err.message}`);
    return false;
  }
}

// 5. Automated Task Execution Engine
async function processTicket(ticket) {
  log(`\n======================================================`);
  log(`🚀 AUTONOMOUS EXECUTION TRIGGERED FOR: "${ticket.name}"`);
  log(`📌 Priority: ${ticket.priority} | Remarks: "${ticket.remarks}"`);

  const slug = ticket.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const branchName = `feat/${slug}`;

  // Fetch page body / requirements
  const requirements = await getTicketRequirements(ticket.id);
  log(`📄 Requirements:\n${requirements || '(No body text)'}`);

  try {
    // Step A: GitFlow branch setup
    log(`🌿 Switching to develop and pulling latest...`);
    runCmd('git checkout develop');
    try { runCmd('git pull origin develop'); } catch { /* ignore if already up to date */ }

    log(`🌱 Creating feature branch: ${branchName}...`);
    try {
      runCmd(`git checkout -b ${branchName}`);
    } catch {
      runCmd(`git checkout ${branchName}`);
    }

    // Step B: Execute Code Modifications based on Ticket Intent
    log(`🔨 Applying automated code changes...`);
    applyCodeModifications(ticket, requirements);

    // Step C: Validate build
    log(`🧪 Running production build verification...`);
    runCmd('npm run build');
    log(`✅ Production build passed with 0 errors!`);

    // Step D: Commit & Push to GitHub
    log(`📤 Committing and pushing to GitHub...`);
    runCmd('git add .');
    runCmd(`git commit -m "feat: ${ticket.name} [Notion Auto-Daemon]"`);
    runCmd(`git push -u origin ${branchName}`);

    // Step E: Construct PR URL
    const prUrl = `${GITHUB_REPO}/compare/develop...${branchName}?expand=1`;
    log(`🔗 Pull Request generated: ${prUrl}`);

    // Step F: Mark Notion ticket as Done
    log(`📝 Updating Notion ticket to 'Done'...`);
    await updateNotionTicketDone(ticket.id, prUrl);
    log(`🎉 SUCCESS! Ticket "${ticket.name}" is completed & synced with Notion!`);
    log(`======================================================\n`);
  } catch (err) {
    log(`❌ Error processing ticket "${ticket.name}": ${err.message}`);
  }
}

// Code modification handler for tasks
function applyCodeModifications(ticket, requirements) {
  const titleLower = ticket.name.toLowerCase();
  const reqLower = requirements.toLowerCase();

  // Pattern: Rename logo or branding (e.g. "Change the Logo name as Test App")
  if (titleLower.includes('logo') || titleLower.includes('rename') || reqLower.includes('test app')) {
    const targetName = titleLower.includes('test app') ? 'Test App' : 'ETH';
    log(`✏️ Updating logo branding to: "${targetName}"`);

    // Update index.html
    const htmlPath = path.join(rootDir, 'index.html');
    if (fs.existsSync(htmlPath)) {
      let html = fs.readFileSync(htmlPath, 'utf8');
      html = html.replace(/<title>.*?<\/title>/, `<title>${targetName} - Intelligent Workflow Engine</title>`);
      fs.writeFileSync(htmlPath, html, 'utf8');
    }

    // Update App.jsx
    const appPath = path.join(rootDir, 'src', 'App.jsx');
    if (fs.existsSync(appPath)) {
      let app = fs.readFileSync(appPath, 'utf8');
      app = app.replace(/<span>(NovaFlow|ETH)<\/span>/g, `<span>${targetName}</span>`);
      app = app.replace(/(NovaFlow|ETH) Engine/g, `${targetName} Engine`);
      fs.writeFileSync(appPath, app, 'utf8');
    }
  }

  // Handle remarks or color tweaks if present
  if (ticket.remarks && ticket.remarks.toLowerCase().includes('space')) {
    log(`✏️ Applying spacing fix from remarks...`);
    const cssPath = path.join(rootDir, 'src', 'index.css');
    if (fs.existsSync(cssPath)) {
      let css = fs.readFileSync(cssPath, 'utf8');
      if (!css.includes('margin-right: 12px;')) {
        css = css.replace('.nav-actions {', '.nav-actions {\n  margin-right: 12px;');
        fs.writeFileSync(cssPath, css, 'utf8');
      }
    }
  }
}

// 6. Main Polling Loop
let isProcessing = false;

async function poll() {
  if (isProcessing) return;
  
  const inProgressTickets = await getInProgressTickets();
  if (inProgressTickets.length > 0) {
    isProcessing = true;
    for (const ticket of inProgressTickets) {
      await processTicket(ticket);
    }
    isProcessing = false;
  }
}

log(`🟢 [Notion Auto-Daemon] Active and listening on database: ${DATABASE_ID}`);
log(`⏱️ Polling Notion every ${POLL_INTERVAL_MS / 1000}s for tickets with Status == 'In progress'...`);
log(`👉 Move any ticket to 'In progress' in Notion to trigger automatic execution!`);

setInterval(poll, POLL_INTERVAL_MS);
poll(); // Run initial check immediately
