import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const brainDir = path.join(rootDir, '.agents', 'brain');

let cachedGraph = null;
let cachedKnowledge = null;

// 1. Load Local AST Graph into Memory
export function loadBrain() {
  if (cachedGraph && cachedKnowledge) {
    return { graph: cachedGraph, knowledge: cachedKnowledge };
  }

  const graphPath = path.join(brainDir, 'graph.json');
  const knowledgePath = path.join(brainDir, 'knowledge.json');

  if (!fs.existsSync(graphPath) || !fs.existsSync(knowledgePath)) {
    // If not built yet, run builder automatically
    try {
      const { execSync } = import('child_process');
      execSync('node scripts/build-brain.js', { cwd: rootDir, stdio: 'inherit' });
    } catch {}
  }

  if (fs.existsSync(graphPath)) {
    cachedGraph = JSON.parse(fs.readFileSync(graphPath, 'utf8'));
  }
  if (fs.existsSync(knowledgePath)) {
    cachedKnowledge = JSON.parse(fs.readFileSync(knowledgePath, 'utf8'));
  }

  return { graph: cachedGraph, knowledge: cachedKnowledge };
}

// 2. Query Brain by Concept / Keyword
export function queryBrain(concept) {
  const { graph } = loadBrain();
  if (!graph || !graph.conceptIndex) return [];

  const key = concept.toLowerCase().trim();
  const directMatches = graph.conceptIndex[key] || [];

  if (directMatches.length > 0) {
    return directMatches.map(m => {
      const node = graph.nodes.find(n => n.id === m.targetNodeId);
      return { ...m, node };
    });
  }

  // Partial substring match across concepts
  const partials = [];
  for (const [k, matches] of Object.entries(graph.conceptIndex)) {
    if (k.includes(key) || key.includes(k)) {
      matches.forEach(m => {
        const node = graph.nodes.find(n => n.id === m.targetNodeId);
        partials.push({ ...m, matchedKeyword: k, node });
      });
    }
  }

  return partials;
}

// 3. Resolve Target Section & Files for a Ticket
export function resolveTicketTarget(ticketName, requirements = '') {
  const { graph } = loadBrain();
  const combined = `${ticketName} ${requirements}`.toLowerCase();

  // Search sections in App.jsx
  if (graph && graph.app && graph.app.sections) {
    for (const sec of graph.app.sections) {
      const secWords = sec.name.toLowerCase().split(/\s+/);
      const isMatch = secWords.some(w => w.length > 3 && combined.includes(w)) || combined.includes(sec.id);
      
      if (isMatch) {
        return {
          found: true,
          targetFile: 'src/App.jsx',
          sectionName: sec.name,
          startLine: sec.startLine,
          endLine: sec.endLine,
          classes: sec.classes,
          icons: sec.iconsUsed,
          currentBrand: graph.app.currentBrand
        };
      }
    }
  }

  // Fallback default
  return {
    found: false,
    targetFile: 'src/App.jsx',
    currentBrand: graph?.app?.currentBrand || 'ETH',
    classes: []
  };
}

export default {
  loadBrain,
  queryBrain,
  resolveTicketTarget
};
