/**
 * Patches ios/Podfile after `expo prebuild` to fix the Clang _FORTIFY_SOURCE=2
 * false-positive error in jsi.h (UUID::toString) on Release/Archive builds (Xcode 16).
 *
 * IMPORTANT: Merges into the existing post_install block rather than adding a new one.
 * CocoaPods only runs the LAST post_install block, so adding a second one would
 * prevent react_native_post_install from running and crash the app.
 *
 * Run via: node plugins/with-fortify-fix.js
 * Called automatically by the "prebuild:clean" script in package.json.
 */
const fs = require('fs');
const path = require('path');

const MARKER = '# [fortify-fix]';
const PODFILE = path.join(__dirname, '../ios/Podfile');

// This snippet is inserted just before the closing `end` of the existing post_install block
const FORTIFY_SNIPPET = `    # [fortify-fix] _FORTIFY_SOURCE=0 for Release — fixes jsi.h snprintf false-positive on Xcode 16
    installer.pods_project.targets.each do |target|
      target.build_configurations.each do |config|
        next unless config.name == 'Release'
        defs = config.build_settings['GCC_PREPROCESSOR_DEFINITIONS']
        if defs.nil?
          defs = ['$(inherited)']
        elsif defs.is_a?(String)
          defs = [defs]
        end
        unless defs.any? { |d| d.to_s.include?('_FORTIFY_SOURCE') }
          defs << '_FORTIFY_SOURCE=0'
        end
        config.build_settings['GCC_PREPROCESSOR_DEFINITIONS'] = defs
      end
    end`;

if (!fs.existsSync(PODFILE)) {
  console.error('[fortify-fix] Podfile not found at', PODFILE);
  process.exit(1);
}

let content = fs.readFileSync(PODFILE, 'utf8');

if (content.includes(MARKER)) {
  console.log('[fortify-fix] Podfile already patched, skipping.');
  process.exit(0);
}

// Find the post_install block that contains react_native_post_install and inject before its closing end
const POST_INSTALL_CLOSE = /( {2}end\nend\s*$)/;
if (!POST_INSTALL_CLOSE.test(content)) {
  console.error('[fortify-fix] Could not find post_install closing end. Podfile structure unexpected.');
  process.exit(1);
}

content = content.replace(POST_INSTALL_CLOSE, `${FORTIFY_SNIPPET}\n  end\nend\n`);
fs.writeFileSync(PODFILE, content);
console.log('[fortify-fix] Podfile patched ✓');

