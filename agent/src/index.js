#!/usr/bin/env node
/**
 * WhatsApp → website agent.
 *
 *   node src/index.js                      process the newest export in inbox/
 *   node src/index.js --file chat.txt      process a specific export
 *   node src/index.js --dry-run            edit files and show the diff, no PR
 *   node src/index.js --all                ignore the last-run marker
 *   node src/index.js --watch              keep running, poll inbox/ for exports
 *
 * Export a chat in WhatsApp (⋮ → More → Export chat → Without media), drop the
 * .txt into agent/inbox/, and run this.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseExportFile, filterMessages, toTranscript, latestTimestamp } from './whatsapp.js';
import { runAgent } from './agent.js';
import * as git from './git.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const AGENT_ROOT = path.resolve(HERE, '..');
const CONFIG_PATH = path.join(AGENT_ROOT, 'config.json');
const STATE_PATH = path.join(AGENT_ROOT, 'state.json');
const INBOX = path.join(AGENT_ROOT, 'inbox');
const PROCESSED = path.join(AGENT_ROOT, 'processed');
const LOG_PATH = path.join(AGENT_ROOT, 'runs.log');

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(`--${name}`);
const value = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

function log(line) {
  process.stdout.write(line + '\n');
  fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${line}\n`);
}

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) throw new Error(`missing config: ${CONFIG_PATH}`);
  const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  cfg.siteRoot = path.resolve(AGENT_ROOT, cfg.siteRoot);
  if (!fs.existsSync(cfg.siteRoot)) throw new Error(`siteRoot does not exist: ${cfg.siteRoot}`);
  return cfg;
}

function loadState() {
  if (!fs.existsSync(STATE_PATH)) return { lastMessageAt: null, runs: [] };
  return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
}

function saveState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + '\n');
}

/** Newest .txt in inbox/, or the file named by --file. */
function pickExport() {
  const explicit = value('file');
  if (explicit) {
    const p = path.resolve(process.cwd(), explicit);
    if (!fs.existsSync(p)) throw new Error(`no such file: ${p}`);
    return p;
  }
  if (!fs.existsSync(INBOX)) return null;
  const files = fs
    .readdirSync(INBOX)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => path.join(INBOX, f))
    .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
  return files[0] ?? null;
}

function branchName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  return `whatsapp-agent/${stamp}`;
}

async function processExport(exportPath, cfg, state, { dryRun }) {
  log(`\n=== ${path.basename(exportPath)}`);

  const all = parseExportFile(exportPath);
  const fresh = filterMessages(all, {
    since: flag('all') ? null : state.lastMessageAt,
    allowedSenders: cfg.allowedSenders ?? [],
  });

  log(`parsed ${all.length} messages, ${fresh.length} new`);
  if (!fresh.length) {
    log('nothing new to act on');
    return { status: 'no-new-messages' };
  }

  const transcript = toTranscript(fresh);
  const newestAt = latestTimestamp(fresh);

  if (!git.isClean(cfg.siteRoot)) {
    throw new Error(
      'the website repo has uncommitted changes — commit or stash them first so the agent starts from a clean tree',
    );
  }

  const base = git.defaultBranch(cfg.siteRoot);
  const branch = branchName();
  git.checkout(base, cfg.siteRoot);
  git.createBranch(branch, cfg.siteRoot);
  log(`branch ${branch} (from ${base})`);

  let result;
  try {
    log('running agent...');
    result = await runAgent({
      transcript,
      siteRoot: cfg.siteRoot,
      editable: cfg.editablePaths,
      maxIterations: cfg.maxIterations ?? 40,
      effort: cfg.effort ?? 'xhigh',
      log,
    });
  } catch (err) {
    git.checkout(base, cfg.siteRoot);
    git.deleteBranch(branch, cfg.siteRoot);
    throw err;
  }

  const { proposal, changedFiles, usage, iterations } = result;
  log(`agent finished in ${iterations} turns (${usage.output} output tokens)`);

  if (!proposal) {
    git.checkout(base, cfg.siteRoot);
    git.deleteBranch(branch, cfg.siteRoot);
    throw new Error('the agent stopped without filing a proposal — nothing was kept');
  }

  if (!changedFiles.length) {
    log(`no website changes needed: ${proposal.summary}`);
    for (const q of proposal.openQuestions ?? []) log(`  open question: ${q}`);
    git.checkout(base, cfg.siteRoot);
    git.deleteBranch(branch, cfg.siteRoot);
    return { status: 'no-changes', proposal, newestAt };
  }

  log(`changed ${changedFiles.length} file(s): ${changedFiles.join(', ')}`);

  if (dryRun) {
    log('\n--- diff ---\n' + git.diffStat(cfg.siteRoot));
    log(`\ndry run: edits are left on branch ${branch}, nothing pushed`);
    log(`inspect with:  git -C ${cfg.siteRoot} diff ${base}...${branch}`);
    log(`discard with:  git -C ${cfg.siteRoot} checkout ${base} && git -C ${cfg.siteRoot} branch -D ${branch}`);
    return { status: 'dry-run', proposal, branch, newestAt };
  }

  const commitMessage = [
    proposal.title,
    '',
    proposal.summary,
    '',
    ...proposal.changes.map((c) => `- ${c}`),
    '',
    `Source: ${path.basename(exportPath)}`,
    '',
    'Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>',
  ].join('\n');

  const sha = git.commitAll(commitMessage, changedFiles, cfg.siteRoot);
  log(`committed ${sha}`);

  git.push(branch, cfg.siteRoot);

  const body = git.buildPrBody({
    proposal,
    transcript,
    sourceFile: path.basename(exportPath),
    model: 'claude-opus-5',
  });
  const url = git.openPullRequest({
    title: proposal.title,
    body,
    base,
    head: branch,
    cwd: cfg.siteRoot,
  });

  git.checkout(base, cfg.siteRoot);
  log(`pull request: ${url}`);

  return { status: 'pr-opened', url, proposal, branch, newestAt };
}

function archive(exportPath) {
  if (!exportPath.startsWith(INBOX)) return; // --file outside inbox: leave it alone
  fs.mkdirSync(PROCESSED, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const target = path.join(PROCESSED, `${stamp}--${path.basename(exportPath)}`);
  fs.renameSync(exportPath, target);
  log(`archived export → processed/${path.basename(target)}`);
}

async function runOnce(cfg, { dryRun }) {
  const exportPath = pickExport();
  if (!exportPath) {
    log('inbox is empty — export a chat from WhatsApp and drop the .txt into agent/inbox/');
    return null;
  }

  const state = loadState();
  const result = await processExport(exportPath, cfg, state, { dryRun });

  if (!dryRun && result.newestAt) {
    state.lastMessageAt = result.newestAt;
    state.runs.push({
      at: new Date().toISOString(),
      source: path.basename(exportPath),
      status: result.status,
      url: result.url ?? null,
    });
    saveState(state);
    archive(exportPath);
  }

  return result;
}

async function main() {
  const cfg = loadConfig();
  const dryRun = flag('dry-run');

  if (!flag('watch')) {
    await runOnce(cfg, { dryRun });
    return;
  }

  const seconds = Number(value('interval') ?? cfg.watchIntervalSeconds ?? 60);
  log(`watching ${INBOX} every ${seconds}s — Ctrl-C to stop`);
  for (;;) {
    try {
      await runOnce(cfg, { dryRun });
    } catch (err) {
      log(`error: ${err.message}`);
    }
    await new Promise((r) => setTimeout(r, seconds * 1000));
  }
}

main().catch((err) => {
  log(`error: ${err.message}`);
  process.exitCode = 1;
});
