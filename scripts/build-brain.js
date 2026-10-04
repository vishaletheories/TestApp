import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const brainDir = path.join(rootDir, '.agents', 'brain');

console.log('🧠 [Codebase Brain Generator] Initializing AST Knowledge Graph extraction...');

// Ensure .agents/brain directory exists
if (!fs.existsSync(brainDir)) {
  fs.mkdirSync(brainDir, { recursive: true });
}

// 1. Parse App.jsx Sections, Imports, State, and JSX Structure
function parseAppJsx() {
  const appPath = path.join(rootDir, 'src', 'App.jsx');
  if (!fs.existsSync(appPath)) return null;

  const content = fs.readFileSync(appPath, 'utf8');
  const lines = content.split('\n');

  // A. Extract imports
  const imports = [];
  const iconImports = [];
  const iconMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"];?/);
  if (iconMatch) {
    iconMatch[1].split(',').forEach(icon => {
      const trimmed = icon.trim();
      if (trimmed) iconImports.push(trimmed);
    });
  }

  // B. Extract hooks and states
  const stateVariables = [];
  const stateMatches = content.matchAll(/const\s*\[(\w+),\s*set\w+\]\s*=\s*useState/g);
  for (const match of stateMatches) {
    stateVariables.push(match[1]);
  }

  // C. Extract Sections by Comment & ID
  const sections = [];
  const sectionCommentRegex = /\{\/\*\s*([^*]+?)\s*\*\/\}/g;
  let match;
  const sectionPositions = [];

  while ((match = sectionCommentRegex.exec(content)) !== null) {
    const lineNum = content.substring(0, match.index).split('\n').length;
    sectionPositions.push({ name: match[1].trim(), startLine: lineNum, index: match.index });
  }

  for (let i = 0; i < sectionPositions.length; i++) {
    const curr = sectionPositions[i];
    const next = sectionPositions[i + 1];
    const endLine = next ? next.startLine - 1 : lines.length;
    const sectionChunk = lines.slice(curr.startLine - 1, endLine).join('\n');

    // Extract classes in this section
    const classes = new Set();
    const classMatches = sectionChunk.matchAll(/className=['"]([^'"]+)['"]/g);
    for (const cm of classMatches) {
      cm[1].split(' ').forEach(cls => { if (cls.trim()) classes.add(cls.trim()); });
    }

    // Extract icons used in this section
    const iconsUsed = iconImports.filter(icon => new RegExp(`<${icon}\\b`).test(sectionChunk));

    // Extract ID if present
    const idMatch = sectionChunk.match(/id=['"]([^'"]+)['"]/);
    const id = idMatch ? idMatch[1] : null;

    sections.push({
      id: id || curr.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      name: curr.name,
      startLine: curr.startLine,
      endLine,
      classes: Array.from(classes),
      iconsUsed,
      keySnippets: lines.slice(curr.startLine - 1, Math.min(curr.startLine + 4, endLine)).map(l => l.trim()).filter(Boolean)
    });
  }

  // D. Extract branding tokens
  const logoMatch = content.match(/<a[^>]*className=['"]logo['"][^>]*>[\s\S]*?<span>([^<]+)<\/span>/);
  const currentBrand = logoMatch ? logoMatch[1].trim() : 'Unknown';

  return {
    file: 'src/App.jsx',
    totalLines: lines.length,
    currentBrand,
    imports: { lucide: iconImports },
    stateVariables,
    sections
  };
}

// 2. Parse index.css Themes & Utility Classes
function parseIndexCss() {
  const cssPath = path.join(rootDir, 'src', 'index.css');
  if (!fs.existsSync(cssPath)) return null;

  const content = fs.readFileSync(cssPath, 'utf8');
  const lines = content.split('\n');

  // Extract root CSS variables
  const cssVars = [];
  const varMatches = content.matchAll(/--([a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g);
  for (const vm of varMatches) {
    cssVars.push({ name: `--${vm[1]}`, value: vm[2].trim() });
  }

  // Extract main class selectors
  const classSelectors = new Set();
  const selectorMatches = content.matchAll(/\.([a-zA-Z0-9_-]+)\s*\{/g);
  for (const sm of selectorMatches) {
    classSelectors.add(sm[1]);
  }

  return {
    file: 'src/index.css',
    totalLines: lines.length,
    variablesCount: cssVars.length,
    classes: Array.from(classSelectors),
    themes: ['dark', 'light']
  };
}

// 3. Parse index.html Metadata
function parseIndexHtml() {
  const htmlPath = path.join(rootDir, 'index.html');
  if (!fs.existsSync(htmlPath)) return null;

  const content = fs.readFileSync(htmlPath, 'utf8');
  const titleMatch = content.match(/<title>(.*?)<\/title>/);
  return {
    file: 'index.html',
    title: titleMatch ? titleMatch[1] : 'Untitled'
  };
}

// 4. Construct the Unified AST Knowledge Graph
function buildKnowledgeGraph() {
  const appData = parseAppJsx();
  const cssData = parseIndexCss();
  const htmlData = parseIndexHtml();

  const nodes = [];
  const edges = [];
  const conceptIndex = {};

  // Register File Nodes
  nodes.push({ id: 'file:App.jsx', type: 'file', path: 'src/App.jsx' });
  nodes.push({ id: 'file:index.css', type: 'file', path: 'src/index.css' });
  nodes.push({ id: 'file:index.html', type: 'file', path: 'index.html' });

  // Register Concept Maps
  function addConcept(keyword, targetNodeId, metadata = {}) {
    const key = keyword.toLowerCase();
    if (!conceptIndex[key]) conceptIndex[key] = [];
    conceptIndex[key].push({ targetNodeId, ...metadata });
  }

  if (appData) {
    // Add Brand node
    const brandNodeId = `brand:${appData.currentBrand}`;
    nodes.push({ id: brandNodeId, type: 'brand', value: appData.currentBrand });
    edges.push({ from: 'file:App.jsx', to: brandNodeId, relation: 'defines_brand' });
    addConcept('brand', brandNodeId, { file: 'src/App.jsx' });
    addConcept('logo', brandNodeId, { file: 'src/App.jsx' });
    addConcept(appData.currentBrand, brandNodeId, { file: 'src/App.jsx' });

    // Add Section Nodes
    for (const sec of appData.sections) {
      const secNodeId = `section:${sec.id}`;
      nodes.push({
        id: secNodeId,
        type: 'component_section',
        name: sec.name,
        startLine: sec.startLine,
        endLine: sec.endLine,
        classes: sec.classes,
        icons: sec.iconsUsed
      });
      edges.push({ from: 'file:App.jsx', to: secNodeId, relation: 'contains_section' });

      // Index section keywords
      const words = sec.name.toLowerCase().split(/\s+/);
      words.forEach(w => addConcept(w, secNodeId, { startLine: sec.startLine, endLine: sec.endLine, file: 'src/App.jsx' }));
      addConcept(sec.id, secNodeId, { startLine: sec.startLine, endLine: sec.endLine, file: 'src/App.jsx' });

      // Link classes to index.css
      for (const cls of sec.classes) {
        edges.push({ from: secNodeId, to: `css:.${cls}`, relation: 'styled_by' });
        addConcept(cls, secNodeId, { file: 'src/index.css' });
      }
    }
  }

  // Save Graph
  const graph = {
    version: '2026.9',
    generatedAt: new Date().toISOString(),
    project: 'notion-react-landing',
    meta: {
      totalNodes: nodes.length,
      totalEdges: edges.length,
      indexedConcepts: Object.keys(conceptIndex).length
    },
    app: appData,
    css: cssData,
    html: htmlData,
    nodes,
    edges,
    conceptIndex
  };

  const graphPath = path.join(brainDir, 'graph.json');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf8');

  // Save Knowledge Rules & Best Practices
  const knowledge = {
    version: '2026.9',
    designSystem: {
      framework: 'React + Vanilla CSS',
      themeSupport: ['dark', 'light'],
      iconLibrary: 'lucide-react',
      rootElement: '#root'
    },
    codeConventions: [
      'Use surgical element replacement instead of full file rewrites',
      'Never duplicate lucide-react icon imports if already present',
      'Reuse existing .features-grid and .feature-card classes for card layouts',
      'Always preserve state variables (theme, contactForm) in src/App.jsx',
      'Production build must pass with 0 errors via npm run build'
    ],
    lastIndexedBrand: appData ? appData.currentBrand : 'Unknown',
    lastIndexedSections: appData ? appData.sections.map(s => s.name) : []
  };

  const knowledgePath = path.join(brainDir, 'knowledge.json');
  fs.writeFileSync(knowledgePath, JSON.stringify(knowledge, null, 2), 'utf8');

  console.log(`✅ [Codebase Brain Generator] Success!`);
  console.log(`   📊 Nodes Created: ${nodes.length}`);
  console.log(`   🔗 Edges Mapped: ${edges.length}`);
  console.log(`   🏷️ Concepts Indexed: ${Object.keys(conceptIndex).length}`);
  console.log(`   📁 Output: .agents/brain/graph.json & knowledge.json`);
}

buildKnowledgeGraph();
