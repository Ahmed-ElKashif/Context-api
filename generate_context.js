const fs = require('fs');
const path = require('path');

const excludeDirs = ['node_modules', 'venv', '.git', 'uploads', 'dist', 'build', '.vscode', 'coverage'];
const excludeFiles = ['package-lock.json', '.DS_Store', 'project_context.md', 'generate_context.js'];
const excludeExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.mp4', '.webm', '.pdf', '.zip'];

function generateTree(dir, prefix = '') {
  let output = '';
  try {
    const files = fs.readdirSync(dir);
    const validFiles = files.filter(file => {
      const isExcludedDir = excludeDirs.includes(file);
      const isExcludedFile = excludeFiles.includes(file);
      const ext = path.extname(file).toLowerCase();
      const isExcludedExt = excludeExtensions.includes(ext);
      return !isExcludedDir && !isExcludedFile && !isExcludedExt;
    });

    validFiles.forEach((file, index) => {
      const fullPath = path.join(dir, file);
      const isLast = index === validFiles.length - 1;
      const marker = isLast ? '└── ' : '├── ';
      output += prefix + marker + file + '\n';
      
      try {
        if (fs.statSync(fullPath).isDirectory()) {
          const childPrefix = prefix + (isLast ? '    ' : '│   ');
          output += generateTree(fullPath, childPrefix);
        }
      } catch (e) {
        // ignore
      }
    });
  } catch (e) {
    // ignore
  }
  return output;
}

function getLanguageTag(filename) {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.js': return 'javascript';
    case '.ts': return 'typescript';
    case '.json': return 'json';
    case '.md': return 'markdown';
    case '.html': return 'html';
    case '.css': return 'css';
    case '.yml':
    case '.yaml': return 'yaml';
    case '.sh': return 'bash';
    case '.py': return 'python';
    case '.env':
    case '.env.example': return 'properties';
    default: return 'text';
  }
}

function generateContent(dir, baseDir) {
  let output = '';
  try {
    const files = fs.readdirSync(dir);
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      const isExcludedDir = excludeDirs.includes(file);
      const isExcludedFile = excludeFiles.includes(file);
      const ext = path.extname(file).toLowerCase();
      const isExcludedExt = excludeExtensions.includes(ext);

      if (isExcludedDir || isExcludedFile || isExcludedExt) return;

      if (fs.statSync(fullPath).isDirectory()) {
        output += generateContent(fullPath, baseDir);
      } else {
        const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        const lang = getLanguageTag(file);
        const content = fs.readFileSync(fullPath, 'utf8');
        output += `\n--- PATH: ${relativePath} ---\n`;
        output += `\`\`\`${lang}\n${content}\n\`\`\`\n`;
      }
    });
  } catch (e) {
    // ignore
  }
  return output;
}

const rootDir = process.cwd();
let finalOutput = '# Directory Map\n\n```\n.\n';
finalOutput += generateTree(rootDir);
finalOutput += '```\n\n# File Contents\n';
finalOutput += generateContent(rootDir, rootDir);

fs.writeFileSync(path.join(rootDir, 'project_context.md'), finalOutput);
console.log('Project context generated successfully in project_context.md');
