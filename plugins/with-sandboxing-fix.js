/**
 * Patches the main app's project.pbxproj to set ENABLE_USER_SCRIPT_SANDBOXING = NO.
 *
 * Xcode 15+ "Perform Changes" recommendations enable User Script Sandboxing,
 * which blocks the Hermes bundling run-script from writing ip.txt and causes
 * build failures with: "Sandbox: bash deny file-write-create ip.txt"
 *
 * Run via: node plugins/with-sandboxing-fix.js
 * Called automatically by the "prebuild:clean" script in package.json.
 */
const fs = require('fs');
const path = require('path');

const PBXPROJ = path.join(__dirname, '../ios/matebiltuner.xcodeproj/project.pbxproj');

if (!fs.existsSync(PBXPROJ)) {
  console.error('[sandboxing-fix] project.pbxproj not found at', PBXPROJ);
  process.exit(1);
}

let content = fs.readFileSync(PBXPROJ, 'utf8');

const originalCount = (content.match(/ENABLE_USER_SCRIPT_SANDBOXING = YES/g) || []).length;

if (originalCount === 0) {
  console.log('[sandboxing-fix] ENABLE_USER_SCRIPT_SANDBOXING not set to YES — nothing to patch.');
  process.exit(0);
}

content = content.replace(/ENABLE_USER_SCRIPT_SANDBOXING = YES/g, 'ENABLE_USER_SCRIPT_SANDBOXING = NO');

fs.writeFileSync(PBXPROJ, content, 'utf8');
console.log(`[sandboxing-fix] Patched ${originalCount} occurrence(s) of ENABLE_USER_SCRIPT_SANDBOXING: YES → NO`);
