/**
 * Prepares the deploy/ directory for Azure App Service deployment.
 * 
 * Output structure:
 *   deploy/
 *     server.js          (entry point)
 *     package.json       (production deps only)
 *     db/                (compiled server code)
 *     middleware/
 *     routes/
 *     client/dist/       (React build)
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const deployDir = path.join(root, 'deploy');

// Clean and create deploy dir
if (fs.existsSync(deployDir)) {
  fs.rmSync(deployDir, { recursive: true });
}
fs.mkdirSync(deployDir, { recursive: true });

// Copy compiled server files
function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copy server dist
copyDir(path.join(root, 'server', 'dist'), deployDir);

// Copy client dist
const clientDist = path.join(root, 'client', 'dist');
const deployClientDist = path.join(deployDir, 'client', 'dist');
copyDir(clientDist, deployClientDist);

// Rename index.js to server.js at deploy root
const indexJs = path.join(deployDir, 'index.js');
const serverJs = path.join(deployDir, 'server.js');
if (fs.existsSync(indexJs)) {
  fs.renameSync(indexJs, serverJs);
}

// Create production package.json
const serverPkg = JSON.parse(fs.readFileSync(path.join(root, 'server', 'package.json'), 'utf-8'));
const deployPkg = {
  name: 'battlecard',
  version: '1.0.0',
  private: true,
  type: 'module',
  scripts: {
    start: 'node server.js',
  },
  dependencies: { ...serverPkg.dependencies },
};
// Remove devDependencies and @azure/identity if present
delete deployPkg.dependencies['@azure/identity'];
fs.writeFileSync(path.join(deployDir, 'package.json'), JSON.stringify(deployPkg, null, 2));

console.log('Deploy package prepared in deploy/');
