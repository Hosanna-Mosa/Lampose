/**
 * Fails when any file draws text in a font that did not come from
 * `constants/fonts.ts`.
 *
 * That file is the only place a font is imported or named, and `Text`
 * (through `applyFont`) is the only way a string reaches the screen. These
 * rules catch the ways around it — every one of them was in the app once:
 *
 *   1. a font package imported anywhere else
 *   2. a `fontFamily` set by hand instead of by `resolveFontFamily`/`applyFont`
 *   3. React Native's own `Text` used instead of `components/ui/Text`
 *   4. a bare `TextInput` or `Animated.Text` whose style skips `applyFont`
 *   5. `Alert.alert` on the stay side — the OS draws that dialog in its own
 *      font; `useAlert()` draws it in ours
 *
 *   npm run check:fonts
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const SOURCE_DIRS = ['app', 'components', 'constants', 'context', 'hooks', 'lib', 'services', 'utils'];
const FONT_FILE = 'constants/fonts.ts';
const TEXT_COMPONENT = 'components/ui/Text.tsx';
/* Food keeps its own dialogs for now; the font rules still apply to it. */
const FOOD = /^(app\/food\/|components\/food\/|context\/Food)/;

const RN_IMPORT = /import\s*\{([^}]*)\}\s*from\s*['"]react-native['"]/g;

function walk(dir, out) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function lineOf(src, index) {
  return src.slice(0, index).split('\n').length;
}

const problems = [];
const report = (file, src, index, message) =>
  problems.push(`${file}:${lineOf(src, index)}  ${message}`);

for (const dir of SOURCE_DIRS) {
  for (const full of walk(path.join(projectRoot, dir), [])) {
    const file = path.relative(projectRoot, full).split(path.sep).join('/');
    if (file === FONT_FILE) continue;
    const src = fs.readFileSync(full, 'utf8');
    let m;

    const fontImport = /from\s*['"]@expo-google-fonts\//g;
    while ((m = fontImport.exec(src))) {
      report(file, src, m.index, `imports a font package — fonts are imported only in ${FONT_FILE}`);
    }

    const family = /fontFamily\s*:(?!\s*resolveFontFamily\()/g;
    while ((m = family.exec(src))) {
      report(file, src, m.index, 'sets fontFamily by hand — use applyFont() or resolveFontFamily()');
    }

    if (file !== TEXT_COMPONENT) {
      RN_IMPORT.lastIndex = 0;
      while ((m = RN_IMPORT.exec(src))) {
        const names = m[1].split(',').map((name) => name.trim().split(/\s+as\s+/)[0]);
        if (names.includes('Text')) {
          report(file, src, m.index, "imports Text from 'react-native' — use Text from '@/components/ui'");
        }
      }
    }

    /* JSX only — `useRef<TextInput>` is a type, not a text on screen. */
    const raw = /(?<![\w.])<(TextInput|Animated\.Text)\b/g;
    if (!/\b(applyFont|resolveFontFamily)\(/.test(src)) {
      while ((m = raw.exec(src))) {
        report(file, src, m.index, `<${m[1]}> without applyFont() — it would draw in the system font`);
      }
    }

    if (!FOOD.test(file)) {
      const nativeAlert = /\bAlert\.(alert|prompt)\(/g;
      while ((m = nativeAlert.exec(src))) {
        report(file, src, m.index, 'Alert.alert draws in the OS font — use useAlert() from @/components/ui');
      }
    }
  }
}

if (problems.length) {
  console.error(`Fonts: ${problems.length} place(s) draw text outside ${FONT_FILE}:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`Fonts: every text primitive takes its family from ${FONT_FILE}.`);
