/**
 * Builds a Chrome Web Store uploadable archive from the Vite build output.
 *
 * Uses only Node built-ins (node:fs / node:zlib) so the exact same command
 * works on Windows PowerShell, macOS and Linux without extra tooling such as
 * the `zip` CLI, which is not available on a default Windows install.
 *
 * The archive contains the *contents* of dist/, so `manifest.json` sits at the
 * root of the zip (required by the Chrome Web Store upload form).
 */
import { Buffer } from 'node:buffer';
import { deflateRawSync } from 'node:zlib';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const proc = globalThis.process;
const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const distDir = join(projectRoot, 'dist');

function fail(message) {
  proc.stderr.write(`[package-extension] ${message}\n`);
  proc.exitCode = 1;
}

function readVersion() {
  const pkgPath = join(projectRoot, 'package.json');
  try {
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

function collectFiles(dir, base = dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      found.push(...collectFiles(full, base));
    } else if (stats.isFile()) {
      found.push(relative(base, full));
    }
  }
  return found;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (~crc) >>> 0;
}

function dosDateTime(date) {
  const time =
    ((date.getHours() & 0x1f) << 11) |
    ((date.getMinutes() & 0x3f) << 5) |
    ((Math.floor(date.getSeconds() / 2)) & 0x1f);
  const day =
    (((date.getFullYear() - 1980) & 0x7f) << 9) |
    (((date.getMonth() + 1) & 0x0f) << 5) |
    (date.getDate() & 0x1f);
  return { time, day };
}

function buildZip(entries, stamp) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf8');
    const content = entry.data;
    const crc = crc32(content);
    const deflated = deflateRawSync(content, { level: 9 });
    const useDeflate = deflated.length < content.length;
    const payload = useDeflate ? deflated : content;
    const method = useDeflate ? 8 : 0;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(stamp.time, 10);
    local.writeUInt16LE(stamp.day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localParts.push(local, nameBuf, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(stamp.time, 12);
    central.writeUInt16LE(stamp.day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralParts.push(central, nameBuf);

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

if (!existsSync(distDir)) {
  fail(`dist/ not found at ${distDir}. Run "npm run build" first.`);
} else {
  const relativeFiles = collectFiles(distDir).sort();
  if (relativeFiles.length === 0) {
    fail(`dist/ is empty at ${distDir}. Run "npm run build" first.`);
  } else if (!relativeFiles.includes('manifest.json')) {
    fail('dist/manifest.json is missing — the archive must contain manifest.json at its root.');
  } else {
    const entries = relativeFiles.map((rel) => ({
      name: rel.split(sep).join('/'),
      data: readFileSync(join(distDir, rel)),
    }));

    const version = readVersion();
    const outputPath = join(projectRoot, `browgent-${version}.zip`);
    const zip = buildZip(entries, dosDateTime(new Date()));

    writeFileSync(outputPath, zip);

    globalThis.console.log(`[package-extension] Packed ${entries.length} files from dist/`);
    globalThis.console.log(`[package-extension] Output: ${outputPath}`);
    globalThis.console.log(`[package-extension] Size: ${(zip.length / 1024).toFixed(1)} KiB`);
    for (const entry of entries) {
      globalThis.console.log(`  ${entry.name}`);
    }
  }
}
