// Add/update an entry in CloudronVersions.json for the CURRENT package version
// (read from CloudronManifest.json), pointing at the given public docker image.
//
// Run in CI after the image has been pushed:
//   node scripts/update-versions.mjs ghcr.io/jfilter/ihatemoney:<version> [rfc2822-date]
//
// Produces the schema Cloudron expects (see a live community package for ref):
//   { "stable": true, "versions": { "<v>": { creationDate, manifest:{…,dockerImage}, publishState, ts } } }
// file:// references in the manifest (description/changelog/postInstallMessage)
// are inlined, since the hosted catalog is standalone and can't resolve them.

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const [, , dockerImage, dateArg] = process.argv;
if (!dockerImage) {
  console.error("usage: update-versions.mjs <dockerImage> [rfc2822-date]");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("CloudronManifest.json", "utf8"));
const version = manifest.version;
const date = dateArg || new Date().toUTCString();

const inline = (ref) => {
  if (typeof ref === "string" && ref.startsWith("file://")) {
    const path = ref.slice("file://".length);
    return existsSync(path) ? readFileSync(path, "utf8").trim() : "";
  }
  return ref;
};

const entryManifest = { ...manifest, dockerImage };
for (const key of ["description", "changelog", "postInstallMessage"]) {
  if (manifest[key] !== undefined) entryManifest[key] = inline(manifest[key]);
}
// Community-catalog installs require a fetchable iconUrl (served from raw GitHub).
if (existsSync("logo.png")) {
  entryManifest.iconUrl = "https://raw.githubusercontent.com/jfilter/cloudron-ihatemoney/main/logo.png";
}

const catalog = existsSync("CloudronVersions.json")
  ? JSON.parse(readFileSync("CloudronVersions.json", "utf8"))
  : { stable: true, versions: {} };

catalog.stable = true;
catalog.versions ??= {};
// Preserve an existing version's creationDate so re-running with unchanged files
// yields an identical catalog (idempotent — avoids spurious release commits).
const existing = catalog.versions[version];
const created = existing ? existing.creationDate : date;
catalog.versions[version] = {
  creationDate: created,
  manifest: entryManifest,
  publishState: existing ? existing.publishState : "published",
  ts: created,
};

writeFileSync("CloudronVersions.json", JSON.stringify(catalog, null, 2) + "\n");
console.log(`CloudronVersions.json: ${version} -> ${dockerImage}`);
