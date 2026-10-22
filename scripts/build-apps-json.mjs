/*
  Builds data/apps.json for NOON Store.

  It reads every public repository of the GitHub user, finds the APK files
  in the releases, and saves the result so the website does not need to call
  the GitHub API for each visitor.

  Run locally:   GITHUB_TOKEN=xxxx node scripts/build-apps-json.mjs
  Needs Node 20 or newer. The logic mirrors js/common.js (section 4).
*/

import { readFile, writeFile, mkdir } from "node:fs/promises";

const USER = "mhamad-code";
const API = "https://api.github.com";
const OUTPUT = "data/apps.json";
const TOKEN = process.env.GITHUB_TOKEN;


/* ---------- GitHub API ---------- */

async function gh(path) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "noon-store-updater"
  };
  if (TOKEN) {
    headers.Authorization = `Bearer ${TOKEN}`;
  }

  const res = await fetch(API + path, { headers });

  if (res.status === 404 || res.status === 409) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`GitHub ${res.status} for ${path}`);
  }
  return res.json();
}


/* ---------- Helpers ---------- */

function pretty(name) {
  return name
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function stem(fileName) {
  const abiWords = /(arm64[-_]?v8a|armeabi[-_]?v7a|armeabi|x86[-_]?64|x86|universal|release|debug|signed|unsigned|aligned)/g;
  const versions = /v?\d+(\.\d+)+\w*/g;

  return fileName
    .replace(/\.apk$/i, "")
    .toLowerCase()
    .replace(abiWords, "")
    .replace(versions, "")
    .replace(/[-_.\s]+/g, "-")
    .replace(/^-+|-+$/g, "") || "app";
}


/* ---------- Building apps ---------- */

function build(repo, release, apkFiles, key) {
  const images = (release.assets || []).filter((a) => /\.(png|jpe?g|webp)$/i.test(a.name));
  const mine = key ? images.filter((a) => a.name.toLowerCase().includes(key)) : images;
  const isShot = (a) => /(screen|shot)/i.test(a.name);

  const icon =
    mine.find((a) => /(icon|logo)/i.test(a.name)) ||
    (key && mine.find((a) => !isShot(a)));

  const shots = mine
    .filter(isShot)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
    .map((a) => a.browser_download_url);

  const hasLicense = repo.license && repo.license.spdx_id !== "NOASSERTION";
  const hasVersion = release.name && release.name !== "latest";

  return {
    repo: repo.name,
    key: key || "",
    name: pretty(key || repo.name),
    desc: key ? "" : repo.description || "",
    icon: icon ? icon.browser_download_url : "",
    branch: repo.default_branch || "HEAD",
    shots,
    apk: apkFiles.map((a) => ({
      name: a.name,
      url: a.browser_download_url,
      size: a.size,
      dl: a.download_count
    })),
    notes: release.body || "",
    updated: release.published_at || release.created_at,
    dl: apkFiles.reduce((sum, a) => sum + a.download_count, 0),
    size: apkFiles[0].size,
    license: hasLicense ? repo.license.spdx_id : "",
    stars: repo.stargazers_count,
    url: repo.html_url,
    lang: repo.language,
    ver: hasVersion ? release.name : ""
  };
}

function collect(repo, releases) {
  const newestFirst = releases
    .filter((r) => !r.draft)
    .sort((a, b) => new Date(b.published_at || b.created_at) - new Date(a.published_at || a.created_at));

  const found = new Map();

  for (const release of newestFirst) {
    const groups = {};
    const apkFiles = (release.assets || []).filter((a) => /\.apk$/i.test(a.name));

    for (const file of apkFiles) {
      const id = stem(file.name);
      groups[id] = groups[id] || [];
      groups[id].push(file);
    }

    for (const id in groups) {
      if (!found.has(id)) {
        found.set(id, { release, files: groups[id] });
      }
    }
  }

  const isMulti = found.size > 1;
  return [...found].map(([id, hit]) => build(repo, hit.release, hit.files, isMulti ? id : ""));
}

async function getRepoApps(repo) {
  const releases = (await gh(`/repos/${USER}/${repo.name}/releases?per_page=30`)) || [];

  const latest = releases.find(
    (r) => !r.draft && /^latest$/i.test(r.tag_name) && (r.assets || []).some((a) => /\.apk$/i.test(a.name))
  );

  return collect(repo, latest ? [latest] : releases);
}

async function enrich(app) {
  if (app.key) {
    return app;
  }

  try {
    const tree = await gh(`/repos/${USER}/${app.repo}/git/trees/${app.branch}?recursive=1`);
    const files = ((tree && tree.tree) || [])
      .filter((f) => f.type === "blob" && !/node_modules|\/build\//i.test(f.path))
      .map((f) => f.path);

    const raw = (path) =>
      `https://raw.githubusercontent.com/${USER}/${app.repo}/${app.branch}/` +
      path.split("/").map(encodeURIComponent).join("/");

    if (!app.icon) {
      const density = { xxxhdpi: 5, xxhdpi: 4, xhdpi: 3, hdpi: 2, mdpi: 1 };

      const score = (path) => {
        const p = path.toLowerCase();
        if (/(^|\/)(icon|logo|app[-_]?icon)\.(png|webp|jpe?g)$/.test(p)) {
          return 100 - p.split("/").length;
        }
        if (/fastlane\/metadata\/android\/[^/]+\/images\/icon\.(png|jpe?g)$/.test(p)) {
          return 90;
        }
        const m = p.match(/res\/mipmap-(\w+)\/ic_launcher(_round|_foreground)?\.(png|webp)$/);
        if (m) {
          const base = m[2] ? (m[2] === "_round" ? 50 : 30) : 70;
          return base + (density[m[1]] || 0);
        }
        return 0;
      };

      const best = files
        .map((path) => [score(path), path])
        .sort((a, b) => b[0] - a[0])[0];

      if (best && best[0] > 0) {
        app.icon = raw(best[1]);
      }
    }

    if (!app.shots.length) {
      app.shots = files
        .filter((p) => /(^|\/)(screenshots?|phonescreenshots)\/[^/]+\.(png|jpe?g|webp)$/i.test(p))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .slice(0, 8)
        .map(raw);
    }
  } catch (error) {
    console.warn(`No icon or screenshots for ${app.repo}: ${error.message}`);
  }

  return app;
}


/* ---------- Main ---------- */

async function main() {
  const allRepos = (await gh(`/users/${USER}/repos?per_page=100&sort=pushed`)) || [];
  const repos = allRepos.filter((r) => !r.fork);

  const lists = await Promise.all(
    repos.map(async (repo) => {
      const apps = await getRepoApps(repo);
      return Promise.all(apps.map(enrich));
    })
  );

  const apps = lists
    .flat()
    .sort((a, b) => new Date(b.updated) - new Date(a.updated));

  const repoList = allRepos.map((r) => ({
    name: r.name,
    description: r.description,
    language: r.language,
    stargazers_count: r.stargazers_count,
    pushed_at: r.pushed_at,
    html_url: r.html_url,
    fork: r.fork
  }));

  // Do not rewrite the file (and create a new commit) when nothing changed.
  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUTPUT, "utf8"));
  } catch {
    previous = null;
  }

  const same =
    previous &&
    JSON.stringify(previous.apps) === JSON.stringify(apps) &&
    JSON.stringify(previous.repos) === JSON.stringify(repoList);

  if (same) {
    console.log("No changes: apps.json is up to date.");
    return;
  }

  const output = {
    generated: new Date().toISOString(),
    user: USER,
    apps,
    repos: repoList
  };

  await mkdir("data", { recursive: true });
  await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
  console.log(`Saved ${apps.length} apps and ${repoList.length} repositories.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
