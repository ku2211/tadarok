import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const readJson = p => JSON.parse(fs.readFileSync(p, 'utf8'));
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const relative = p => path.relative(root, p).split(path.sep).join('/');
const noticeName = n => /^(licen[cs]e|notice|copyright|copying)([.\-_]|$)/i.test(n);
const fallback = {
  '@vitejs/plugin-rsc@0.5.26': ['licenses/rsc.txt'],
  '@cloudflare/vite-plugin@1.37.1': ['licenses/cloudflare.txt'],
  '@cloudflare/workers-types@4.20260515.1': ['licenses/workerd.txt'],
  'wrangler@4.92.0': ['licenses/cloudflare.txt', 'licenses/cloudflare-apache.txt'],
  'drizzle-orm@0.45.2': ['licenses/drizzle-orm.txt'],
  'embla-carousel-react@8.6.0': ['licenses/embla.txt'],
  'input-otp@1.4.2': ['licenses/input.txt'],
  'eslint-config-next@16.3.4': ['licenses/next.txt'],
  'react-remove-scroll-bar@2.3.8': ['licenses/react-remove-scroll-bar.txt'],
};
const packages = new Map();
const chunks = [];
const platformImports = new Set();
const generatedImports = new Set();
const allowGenerated = new Set(['./vinext-client-assets.js', 'virtual:vite-rsc/assets-manifest']);

function findPackage(file) {
  let folder = path.dirname(file);
  while (folder !== path.dirname(folder)) {
    if (fs.existsSync(path.join(folder, 'package.json'))) {
      const meta = readJson(path.join(folder, 'package.json'));
      if (meta.name && meta.version) return { folder, meta };
    }
    folder = path.dirname(folder);
  }
  throw new Error(`Cannot identify a bundled package: ${relative(file)}`);
}

function noticeFiles(folder) {
  return fs.readdirSync(folder, { withFileTypes: true })
    .filter(f => f.isFile() && noticeName(f.name)).map(f => path.join(folder, f.name));
}

function register(pkg, scope, moduleFile) {
  const key = `${pkg.meta.name}@${pkg.meta.version}`;
  let item = packages.get(key);
  if (!item) {
    item = { key, name: pkg.meta.name, version: pkg.meta.version,
      license: pkg.meta.license, repository: pkg.meta.repository ?? null,
      scopes: new Set(), modules: new Set(), notices: new Map() };
    if (!item.license) throw new Error(`No declared license: ${key}`);
    packages.set(key, item);
  }
  item.scopes.add(scope);
  const candidates = noticeFiles(pkg.folder);
  if (moduleFile) {
    item.modules.add(path.relative(pkg.folder, moduleFile).split(path.sep).join('/'));
    let folder = path.dirname(moduleFile);
    while (folder.startsWith(pkg.folder + path.sep)) {
      if (fs.existsSync(folder)) candidates.push(...noticeFiles(folder));
      folder = path.dirname(folder);
    }
  }
  for (const f of fallback[key] ?? []) candidates.push(path.resolve(root, f));
  for (const file of candidates) {
    const bytes = fs.readFileSync(file);
    const digest = sha256(bytes);
    if (!item.notices.has(digest)) item.notices.set(digest, {
      source: file.startsWith(pkg.folder + path.sep)
        ? `npm:${key}/${path.relative(pkg.folder, file).split(path.sep).join('/')}`
        : relative(file), sha256: digest, text: bytes.toString('utf8'),
    });
  }
  return item;
}

for (const environment of ['client', 'rsc', 'ssr']) {
  const report = readJson(path.resolve(root, `work/license-audit/${environment}.json`));
  if (report.environment !== environment || !report.records.length) throw new Error(`Missing ${environment} build evidence`);
  const filenames = new Set(report.records.map(r => r.file));
  for (const chunk of report.records) {
    const output = path.resolve(report.output, chunk.file);
    if (!output.startsWith(path.resolve(root, 'dist') + path.sep)) throw new Error('Unexpected build output path');
    const bytes = fs.readFileSync(output);
    chunks.push({ environment, file: relative(output), sha256: sha256(bytes), bytes: bytes.length });
    for (const specifier of [...chunk.imports, ...chunk.dynamicImports]) {
      if (filenames.has(specifier)) continue;
      if (specifier.startsWith('node:') || specifier === 'cloudflare:workers') platformImports.add(specifier);
      else if (allowGenerated.has(specifier)) generatedImports.add(specifier);
      else throw new Error(`Unreviewed emitted import: ${specifier}`);
    }
    for (const module of chunk.modules) {
      if (module.renderedLength === 0) continue;
      const file = module.id.replaceAll('\0', '').split('?')[0];
      if (!file.includes('/node_modules/')) continue;
      if (!fs.existsSync(file)) throw new Error(`Unresolved bundled module: ${file}`);
      register(findPackage(file), environment, file);
    }
  }
}

const externals = readJson(path.resolve(root, 'dist/server/vinext-externals.json'));
if (!Array.isArray(externals) || externals.length) throw new Error('Review server external packages before publishing');

function installedPackage(name) {
  const direct = path.resolve(root, 'node_modules', name, 'package.json');
  if (fs.existsSync(direct)) return { folder: path.dirname(fs.realpathSync(direct)), meta: readJson(direct) };
  const prefix = name.replace('/', '+') + '@';
  const matches = fs.readdirSync(path.resolve(root, 'node_modules/.pnpm'))
    .filter(n => n.startsWith(prefix)).map(n => path.resolve(root, 'node_modules/.pnpm', n, 'node_modules', name, 'package.json'))
    .filter(n => fs.existsSync(n));
  if (matches.length !== 1) throw new Error(`Cannot uniquely identify generated-code package: ${name}`);
  return { folder: path.dirname(matches[0]), meta: readJson(matches[0]) };
}

// CSS and virtual helper code are emitted by these tools rather than normal chunk modules.
for (const name of ['vite', 'rolldown', 'tailwindcss', 'tw-animate-css', '@cloudflare/vite-plugin']) {
  register(installedPackage(name), 'generated-css-or-helper');
}

const runtimeKeys = new Set(packages.keys());
const project = readJson(path.resolve(root, 'package.json'));
if (project.dependencies?.['drizzle-kit'] || project.devDependencies?.['drizzle-kit']) throw new Error('drizzle-kit is excluded from this release');
for (const name of Object.keys({ ...project.dependencies, ...project.devDependencies })) register(installedPackage(name), 'declared-direct');
for (const item of packages.values()) if (!item.notices.size) throw new Error(`No preserved license text: ${item.key}`);

const assetNotices = [
  ['IBM Plex Sans Arabic', 'public/fonts/OFL.txt'],
  ['shadcn UI and vendor CSS', 'vendor/shadcn-tailwind-4.13.0.LICENSE.md'],
  ['Sites build integration', 'build/sites-vite-plugin.LICENSE'],
  ['Next.js starter SVG files', 'licenses/next.txt'],
];
const describe = item => ({ name: item.name, version: item.version, license: item.license,
  repository: item.repository, scopes: [...item.scopes].sort(), modules: [...item.modules].sort(),
  notices: [...item.notices.values()].map(({ text, ...rest }) => rest) });
const runtime = [...packages.values()].filter(p => runtimeKeys.has(p.key)).sort((a,b) => a.key.localeCompare(b.key));
const noticeBlock = item => `\n\nCOMPONENT: ${item.key}\nDECLARED LICENSE: ${item.license}\n` +
  [...item.notices.values()].map(n => `SOURCE: ${n.source}\nSHA256: ${n.sha256}\n\n${n.text}`).join('\n');
const assetsText = assetNotices.map(([name, file]) => `\n\nASSET: ${name}\nSOURCE: ${file}\n\n${fs.readFileSync(path.resolve(root, file), 'utf8')}`).join('');
const header = 'Tadarok deployment notices\n\nGenerated from the current Vite/Rolldown build module graph for the browser, RSC and SSR outputs, plus CSS, virtual helpers and vendored assets. Upstream licenses apply to their components. This document does not relicense original Tadarok code. Source and provenance: https://github.com/ku2211/tadarok\n';
const runtimeNotices = header + runtime.map(noticeBlock).join('') + assetsText;
const allNotices = header + '\nAdditional scope: all current declared direct build/runtime dependencies. This is not a distribution of node_modules.\n' +
  [...packages.values()].sort((a,b) => a.key.localeCompare(b.key)).map(noticeBlock).join('') + assetsText;

const report = {
  schema_version: 1,
  method: 'generateBundle module records with nonzero rendered length, plus explicit CSS/virtual-helper and vendored-asset notices; final chunk hashes are read after build completion',
  lockfile_sha256: sha256(fs.readFileSync(path.resolve(root, 'pnpm-lock.yaml'))),
  summary: { bundled_javascript_packages: runtime.filter(p => [...p.scopes].some(s => ['client','rsc','ssr'].includes(s))).length,
    css_or_helper_packages: runtime.filter(p => p.scopes.has('generated-css-or-helper')).length,
    distinct_runtime_notice_packages: runtime.length, declared_direct_packages: Object.keys({ ...project.dependencies, ...project.devDependencies }).length,
    missing_license_notices: 0, unresolved_package_imports: 0 },
  platform_imports: [...platformImports].sort(), generated_local_imports: [...generatedImports].sort(),
  packages: runtime.map(describe), assets: assetNotices.map(([name, file]) => ({name, file, sha256: sha256(fs.readFileSync(path.resolve(root, file)))})),
  chunks: chunks.sort((a,b) => a.file.localeCompare(b.file)),
  notices_sha256: sha256(runtimeNotices),
};
fs.mkdirSync(path.resolve(root, 'public'), { recursive: true });
fs.mkdirSync(path.resolve(root, 'docs'), { recursive: true });
for (const directory of ['public', 'dist/client']) {
  fs.writeFileSync(path.resolve(root, directory, 'third-party-notices.txt'), runtimeNotices);
  fs.writeFileSync(path.resolve(root, directory, 'third-party-inventory.json'), JSON.stringify(report, null, 2) + '\n');
}
fs.writeFileSync(path.resolve(root, 'THIRD_PARTY_NOTICES.txt'), allNotices);
fs.writeFileSync(path.resolve(root, 'docs/DEPLOYED-LICENSE-INVENTORY-2026-10-06.json'), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({ license_inventory: report.summary, notices_sha256: report.notices_sha256 }));
