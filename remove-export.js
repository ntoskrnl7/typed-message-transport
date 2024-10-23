const fs = require('fs');
const path = require('path');

function removeExportFromFile(filePath) {
  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const newContent = fileContent.replace(/\n?export \{\};\s*$/, '');
  fs.writeFileSync(filePath, newContent, 'utf-8');
}

function processDirectory(dir) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const fullPath = path.join(dir, file);

    if (fs.statSync(fullPath).isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.d.ts')) {
      removeExportFromFile(fullPath);
    }
  });
}

processDirectory('.');