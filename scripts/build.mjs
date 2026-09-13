#!/usr/bin/env node
// Builds the profile dashboard: fetches public GitHub data and writes SVG cards
// plus README.md. Zero dependencies. Token comes from GITHUB_TOKEN, or `gh auth token`.

import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(fs.readFileSync(path.join(root, "profile.config.json"), "utf8"));
const cardsDir = path.join(root, "cards");

// DPD v6 tokens (dead-pixel-design-v4/src/styles/tokens.css). Radius is 0 everywhere.
const C = {
  canvas: "#060606",
  surface: "#0B0B0B",
  raised: "#151514",
  ink: "#F2F2EF",
  body: "#B4B4B0",
  meta: "#8A8A85",
  faint: "#4A4A47",
  line: "#2E2E2C",
  amber: "#C9955A",
  amberLine: "rgba(201,149,90,0.36)"
};
const SANS = "Inter, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Consolas, 'Liberation Mono', monospace";
const W = 880;
const HALF = 436;

function token() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  return execSync("gh auth token", { encoding: "utf8" }).trim();
}

async function graphql(query, variables) {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token()}`, "Content-Type": "application/json", "User-Agent": "wretcher207-profile" },
    body: JSON.stringify({ query, variables })
  });
  const json = await res.json();
  if (!res.ok || json.errors) throw new Error(`GitHub GraphQL failed: ${JSON.stringify(json.errors ?? json)}`);
  return json.data;
}

async function fetchProfile(login) {
  const repos = [];
  let cursor = null;
  let user;
  do {
    const data = await graphql(
      `query($login: String!, $cursor: String) {
        user(login: $login) {
          followers { totalCount }
          contributionsCollection {
            contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
          }
          repositories(first: 100, after: $cursor, privacy: PUBLIC, ownerAffiliations: OWNER) {
            pageInfo { hasNextPage endCursor }
            nodes {
              name url isFork isArchived stargazerCount forkCount
              primaryLanguage { name }
              languages(first: 12, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
            }
          }
        }
      }`,
      { login, cursor }
    );
    user = data.user;
    repos.push(...user.repositories.nodes);
    cursor = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (cursor);
  return { user, repos };
}

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const compact = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}m` : n >= 1e4 ? `${(n / 1e3).toFixed(1).replace(/\.0$/, "")}k` : n.toLocaleString("en-US");

function svg(width, height, body, title) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
  .sans { font-family: ${SANS}; }
  .mono { font-family: ${MONO}; }
  .kicker { font-family: ${MONO}; font-size: 11px; letter-spacing: 0.14em; fill: ${C.meta}; }
  /* "backwards" hides elements only while the animation runs, so a renderer that
     skips animation still shows everything. */
  .rise { animation: rise 520ms cubic-bezier(.2,.7,.2,1) backwards; }
  @keyframes rise { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
  @media (prefers-reduced-motion: reduce) { .rise { animation: none; } }
</style>
<rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" fill="${C.surface}" stroke="${C.line}"/>
${body}
</svg>
`;
}

// Kicker label with the amber tick the DPD site uses.
const kicker = (x, y, label) =>
  `<rect x="${x}" y="${y - 8}" width="10" height="1.5" fill="${C.amber}"/><text x="${x + 18}" y="${y - 3}" class="kicker">${esc(label.toUpperCase())}</text>`;

function headerCard() {
  const h = config.header;
  const body = `
${kicker(28, 34, h.kicker)}
<text x="28" y="72" class="sans" font-size="30" font-weight="600" letter-spacing="-0.01em" fill="${C.ink}">${esc(h.title)}</text>
<text x="28" y="100" class="sans" font-size="14" fill="${C.body}">${esc(h.subtitle)}</text>
<text x="${W - 28}" y="30" text-anchor="end" class="mono" font-size="11" fill="${C.meta}">${esc(h.meta)}</text>
<rect x="${W - 28 - 8}" y="94" width="8" height="8" fill="${C.amber}"><animate attributeName="opacity" values="1;0.25;1" dur="2.4s" repeatCount="indefinite"/></rect>`;
  return svg(W, 128, body, `${h.title}. ${h.subtitle}`);
}

const ICONS = {
  repo: `<path d="M3 2.5h8.5V14H3.8A1.3 1.3 0 0 1 2.5 12.7V3a.5.5 0 0 1 .5-.5Z M2.5 12.2c0-.7.6-1.2 1.3-1.2h7.7" fill="none"/>`,
  star: `<path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6Z" fill="none"/>`,
  pulse: `<path d="M1.5 8.5h3l1.8-4.5 3.4 8 1.8-3.5h3" fill="none"/>`,
  code: `<path d="M5.5 4 1.8 8l3.7 4M10.5 4l3.7 4-3.7 4" fill="none"/>`,
  fork: `<circle cx="4.5" cy="3.5" r="1.5" fill="none"/><circle cx="11.5" cy="3.5" r="1.5" fill="none"/><circle cx="8" cy="12.5" r="1.5" fill="none"/><path d="M4.5 5v1.5c0 1 .8 1.8 1.8 1.8h3.4c1 0 1.8-.8 1.8-1.8V5M8 8.3V11" fill="none"/>`
};
const icon = (name, x, y, color = C.meta, scale = 1) =>
  `<g transform="translate(${x} ${y}) scale(${scale})" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${ICONS[name]}</g>`;

function statsCard(stats) {
  const gap = 12;
  const tile = (W - gap * 3) / 4;
  const h = 112;
  const tiles = stats
    .map((s, i) => {
      const x = i * (tile + gap);
      const cx = x + tile / 2;
      return `<g class="rise" style="animation-delay:${i * 90}ms">
<rect x="${x + 0.5}" y="0.5" width="${tile - 1}" height="${h - 1}" fill="${C.surface}" stroke="${C.line}"/>
${icon(s.icon, cx - 8, 18)}
<text x="${cx}" y="70" text-anchor="middle" class="mono" font-size="28" font-weight="600" fill="${C.ink}">${esc(s.value)}</text>
<text x="${cx}" y="92" text-anchor="middle" class="kicker" font-size="10">${esc(s.label.toUpperCase())}</text>
</g>`;
    })
    .join("\n");
  // Tiles draw their own frames, so this card skips the outer rect.
  return svg(W, h, tiles, stats.map((s) => `${s.value} ${s.label}`).join(", ")).replace(/<rect x="0.5" y="0.5"[^>]*\/>\n/, "");
}

function contributionsCard(calendar) {
  const weeks = calendar.weeks.slice(-53);
  const days = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)).filter((n) => n > 0).sort((a, b) => a - b);
  const q = (p) => days[Math.min(days.length - 1, Math.floor(p * days.length))] ?? 1;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const ramp = [C.raised, "#3A2E21", "#6A5037", "#9A7348", C.amber];
  const level = (n) => (n === 0 ? 0 : n <= cuts[0] ? 1 : n <= cuts[1] ? 2 : n <= cuts[2] ? 3 : 4);

  const cell = 12;
  const step = 15;
  const left = 64;
  const top = 76;
  const cells = [];
  const months = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const x = left + wi * step;
    const firstDay = new Date(`${week.contributionDays[0].date}T00:00:00Z`);
    if (firstDay.getUTCMonth() !== lastMonth && wi < weeks.length - 2) {
      lastMonth = firstDay.getUTCMonth();
      months.push(`<text x="${x}" y="${top - 10}" class="mono" font-size="10" fill="${C.meta}">${firstDay.toLocaleString("en-US", { month: "short", timeZone: "UTC" })}</text>`);
    }
    const col = week.contributionDays
      .map((d) => {
        const dow = new Date(`${d.date}T00:00:00Z`).getUTCDay();
        return `<rect x="${x}" y="${top + dow * step}" width="${cell}" height="${cell}" fill="${ramp[level(d.contributionCount)]}"><title>${d.contributionCount} on ${d.date}</title></rect>`;
      })
      .join("");
    cells.push(`<g class="rise" style="animation-delay:${Math.round(wi * 14)}ms">${col}</g>`);
  });
  const dayLabels = [["Mon", 1], ["Wed", 3], ["Fri", 5]]
    .map(([l, d]) => `<text x="28" y="${top + d * step + 10}" class="mono" font-size="10" fill="${C.meta}">${l}</text>`)
    .join("");
  const legendX = W - 28 - 32 - 5 * step;
  const legend = ramp.map((c, i) => `<rect x="${legendX + i * step}" y="${top + 7 * step + 16}" width="${cell}" height="${cell}" fill="${c}"/>`).join("");
  const h = top + 7 * step + 48;
  const body = `
${kicker(28, 34, "Contributions")}
<text x="${W - 28}" y="31" text-anchor="end" class="mono" font-size="12" fill="${C.body}">${compact(calendar.totalContributions)} in the last year</text>
${months.join("")}
${dayLabels}
${cells.join("\n")}
<text x="28" y="${top + 7 * step + 26}" class="mono" font-size="10" fill="${C.meta}">Last 53 weeks, public and private</text>
<text x="${legendX - 8}" y="${top + 7 * step + 26}" text-anchor="end" class="mono" font-size="10" fill="${C.meta}">less</text>
${legend}
<text x="${W - 28}" y="${top + 7 * step + 26}" text-anchor="end" class="mono" font-size="10" fill="${C.meta}">more</text>`;
  return svg(W, h, body, `${calendar.totalContributions} contributions in the last year`);
}

function stackCard(items) {
  const h = 196;
  let x = 28;
  let y = 60;
  const pills = items
    .map((label, i) => {
      const w = Math.round(label.length * 7.4 + 28);
      if (x + w > HALF - 28) {
        x = 28;
        y += 38;
      }
      const out = `<g class="rise" style="animation-delay:${i * 50}ms"><rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="27" fill="${C.canvas}" stroke="${C.line}"/><rect x="${x + 10}" y="${y + 11}" width="6" height="6" fill="${i < 3 ? C.amber : C.faint}"/><text x="${x + 22}" y="${y + 18}" class="mono" font-size="11.5" fill="${C.body}">${esc(label)}</text></g>`;
      x += w + 8;
      return out;
    })
    .join("\n");
  return svg(HALF, h, `${kicker(28, 34, "Core stack")}\n${pills}`, `Core stack: ${items.join(", ")}`);
}

// Markup like archived HTML dumps swamps the real code, so config can drop it.
function languageTotals(repos) {
  const skip = new Set(config.excludeLanguages ?? []);
  const totals = new Map();
  for (const r of repos) {
    for (const e of r.languages.edges) {
      if (!skip.has(e.node.name)) totals.set(e.node.name, (totals.get(e.node.name) ?? 0) + e.size);
    }
  }
  return totals;
}

function languagesCard(repos) {
  const totals = languageTotals(repos);
  const sum = [...totals.values()].reduce((a, b) => a + b, 0) || 1;
  let rows = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = rows.slice(0, 5);
  const other = rows.slice(5).reduce((a, [, v]) => a + v, 0);
  if (other > 0) top.push(["Other", other]);
  rows = top;
  const colors = [C.amber, C.ink, C.body, C.meta, C.faint, C.line];

  const h = 196;
  const cx = 104;
  const cy = 112;
  const r = 50;
  const circ = 2 * Math.PI * r;
  let offset = 0;
  const arcs = rows
    .map(([, v], i) => {
      const len = (v / sum) * circ;
      const seg = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${colors[i]}" stroke-width="16" stroke-dasharray="${Math.max(0, len - 2).toFixed(2)} ${circ.toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
      return seg;
    })
    .join("");
  const legend = rows
    .map(([name, v], i) => {
      const y = 70 + i * 20;
      return `<rect x="196" y="${y - 8}" width="8" height="8" fill="${colors[i]}"/><text x="212" y="${y}" class="mono" font-size="11.5" fill="${C.body}">${esc(name)}</text><text x="${HALF - 28}" y="${y}" text-anchor="end" class="mono" font-size="11.5" fill="${C.meta}">${Math.round((v / sum) * 100)}%</text>`;
    })
    .join("");
  const body = `
${kicker(28, 34, "Languages")}
<g class="rise">${arcs}</g>
<text x="${cx}" y="${cy + 4}" text-anchor="middle" class="mono" font-size="11" fill="${C.meta}">${totals.size} langs</text>
${legend}`;
  return svg(HALF, h, body, `Languages: ${rows.map(([n, v]) => `${n} ${Math.round((v / sum) * 100)}%`).join(", ")}`);
}

function wrap(text, max) {
  const lines = [""];
  for (const word of text.split(" ")) {
    const cur = lines[lines.length - 1];
    if (cur && (cur + " " + word).length > max) lines.push(word);
    else lines[lines.length - 1] = cur ? `${cur} ${word}` : word;
  }
  return lines.slice(0, 2);
}

function projectCard(project, repo) {
  const h = 132;
  const lang = project.language ?? repo.primaryLanguage?.name ?? "";
  const desc = wrap(project.description, 56)
    .map((line, i) => `<text x="24" y="${70 + i * 19}" class="sans" font-size="13" fill="${C.body}">${esc(line)}</text>`)
    .join("");
  const langW = Math.round(lang.length * 7 + 18);
  const body = `
<rect x="0" y="0" width="3" height="${h}" fill="${C.amber}" opacity="0.9"/>
${icon("repo", 24, 22, C.amber)}
<text x="48" y="35" class="mono" font-size="14" font-weight="600" fill="${C.ink}">${esc(repo.name)}</text>
${lang ? `<rect x="${HALF - 24 - langW + 0.5}" y="20.5" width="${langW - 1}" height="19" fill="none" stroke="${C.line}"/><text x="${HALF - 24 - langW / 2}" y="34" text-anchor="middle" class="mono" font-size="10.5" fill="${C.meta}">${esc(lang)}</text>` : ""}
${desc}
${icon("star", 24, h - 30, C.meta, 0.85)}
<text x="42" y="${h - 19}" class="mono" font-size="11" fill="${C.meta}">${compact(repo.stargazerCount)}</text>
${icon("fork", 76, h - 30, C.meta, 0.85)}
<text x="94" y="${h - 19}" class="mono" font-size="11" fill="${C.meta}">${compact(repo.forkCount)}</text>
${repo.isArchived ? `<text x="${HALF - 24}" y="${h - 19}" text-anchor="end" class="mono" font-size="10.5" fill="${C.meta}">ARCHIVED</text>` : ""}`;
  return svg(HALF, h, body, `${repo.name}: ${project.description}`);
}

function readme(projects) {
  const img = (file, alt, width) => `<img src="cards/${file}" alt="${esc(alt)}" width="${width}">`;
  const pairs = [];
  for (let i = 0; i < projects.length; i += 2) {
    pairs.push(
      projects
        .slice(i, i + 2)
        .map(({ project, repo }) => `<a href="${repo.url}">${img(`project-${repo.name.toLowerCase()}.svg`, `${repo.name}: ${project.description}`, "49.5%")}</a>`)
        .join(" ")
    );
  }
  return `<!-- Generated by scripts/build.mjs. Edit profile.config.json, not this file. -->
<a href="${config.site}">${img("header.svg", `${config.header.title}. ${config.header.subtitle}`, "100%")}</a>

${img("stats.svg", "Profile stats", "100%")}

${img("contributions.svg", "Contribution activity over the last year", "100%")}

${img("stack.svg", `Core stack: ${config.stack.join(", ")}`, "49.5%")} ${img("languages.svg", "Language breakdown across public repositories", "49.5%")}

${pairs.join("\n\n")}
`;
}

async function main() {
  const { user, repos } = await fetchProfile(config.login);
  const byName = new Map(repos.map((r) => [r.name.toLowerCase(), r]));
  const projects = config.projects.map((project) => {
    const repo = byName.get(project.repo.toLowerCase());
    if (!repo) throw new Error(`Configured project "${project.repo}" is not a public repo of ${config.login}`);
    return { project, repo };
  });
  const owned = repos.filter((r) => !r.isFork);
  const langCount = languageTotals(owned).size;
  const stats = [
    { icon: "repo", value: String(owned.length), label: "Public repos" },
    { icon: "star", value: compact(owned.reduce((a, r) => a + r.stargazerCount, 0)), label: "Stars earned" },
    { icon: "pulse", value: compact(user.contributionsCollection.contributionCalendar.totalContributions), label: "Contributions / yr" },
    { icon: "code", value: String(langCount), label: "Languages" }
  ];

  fs.rmSync(cardsDir, { recursive: true, force: true });
  fs.mkdirSync(cardsDir, { recursive: true });
  const write = (file, content) => fs.writeFileSync(path.join(cardsDir, file), content);
  write("header.svg", headerCard());
  write("stats.svg", statsCard(stats));
  write("contributions.svg", contributionsCard(user.contributionsCollection.contributionCalendar));
  write("stack.svg", stackCard(config.stack));
  write("languages.svg", languagesCard(owned));
  for (const { project, repo } of projects) write(`project-${repo.name.toLowerCase()}.svg`, projectCard(project, repo));
  fs.writeFileSync(path.join(root, "README.md"), readme(projects));
  console.log(`Built ${5 + projects.length} cards for ${config.login}: ${stats.map((s) => `${s.value} ${s.label}`).join(", ")}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
