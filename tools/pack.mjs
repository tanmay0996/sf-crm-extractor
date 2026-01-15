import fs from 'fs';
import path from 'path';

// Resolve project root relative to where the script is executed.
// This avoids issues with URL pathnames on Windows.
const root = path.resolve(process.cwd());
const distPopup = path.join(root, 'dist', 'popup');
const outDir = path.join(root, 'dist-extension');

function rimraf(targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);

  if (stat.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    const dir = path.dirname(dest);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

function main() {
  if (!fs.existsSync(distPopup)) {
    console.error('Popup build not found. Run "npm run build" first.');
    process.exit(1);
  }

  rimraf(outDir);
  fs.mkdirSync(outDir, { recursive: true });

  // Copy manifest
  copyRecursive(path.join(root, 'manifest.json'), path.join(outDir, 'manifest.json'));

  // Copy built popup (served as popup/index.html)
  copyRecursive(distPopup, path.join(outDir, 'popup'));

  // Copy background and content scripts
  copyRecursive(path.join(root, 'src', 'background'), path.join(outDir, 'src', 'background'));
  copyRecursive(path.join(root, 'src', 'content'), path.join(outDir, 'src', 'content'));

  console.log('Extension package created at:', outDir);
}

main();
