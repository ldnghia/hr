/**
 * Generates public/version.json before each production build.
 * The frontend polls this file to detect new deploys and auto-reload.
 */
const fs   = require('fs');
const path = require('path');

const version = { buildId: Date.now().toString() };
const out     = path.join(__dirname, '../public/version.json');

fs.writeFileSync(out, JSON.stringify(version));
console.log(`[generate-version] buildId: ${version.buildId}`);
