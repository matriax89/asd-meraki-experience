import { pathToFileURL } from "node:url";

export function isSupportedNodeVersion(value) {
  if (typeof value !== "string") return false;
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
  if (!match) return false;
  const [major, minor, patch] = match.slice(1).map(Number);
  return [major, minor, patch].every(Number.isSafeInteger)
    && major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (isSupportedNodeVersion(process.versions.node)) {
    console.info(`Node.js ${process.version} · build runtime verified (>=24.22.1 <25).`);
  } else {
    console.error(`Build blocked: Node.js ${process.version}. Use a stable Node.js version >=24.22.1 <25.`);
    process.exitCode = 1;
  }
}
