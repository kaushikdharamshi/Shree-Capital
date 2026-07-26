/**
 * Git and GitHub side of the run: branch, commit, push, open a PR.
 *
 * The agent never touches the default branch. Every run works on its own
 * branch and ends as a pull request for a human to review.
 */

import { execFileSync } from 'node:child_process';

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

export function currentBranch(cwd) {
  return git(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export function isClean(cwd) {
  return git(['status', '--porcelain'], cwd) === '';
}

export function defaultBranch(cwd) {
  try {
    // e.g. "refs/remotes/origin/main" -> "main"
    return git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], cwd).split('/').pop();
  } catch {
    return currentBranch(cwd);
  }
}

export function createBranch(name, cwd) {
  git(['checkout', '-b', name], cwd);
  return name;
}

export function checkout(name, cwd) {
  git(['checkout', name], cwd);
}

export function deleteBranch(name, cwd) {
  git(['branch', '-D', name], cwd);
}

export function diffStat(cwd) {
  return git(['diff', '--stat'], cwd);
}

export function commitAll(message, files, cwd) {
  git(['add', '--', ...files], cwd);
  execFileSync('git', ['commit', '-q', '-F', '-'], { cwd, input: message, encoding: 'utf8' });
  return git(['rev-parse', '--short', 'HEAD'], cwd);
}

export function push(branch, cwd) {
  git(['push', '-u', 'origin', branch], cwd);
}

/** Open a PR with the GitHub CLI. Returns the PR URL. */
export function openPullRequest({ title, body, base, head, cwd }) {
  return execFileSync(
    'gh',
    ['pr', 'create', '--base', base, '--head', head, '--title', title, '--body-file', '-'],
    { cwd, input: body, encoding: 'utf8' },
  ).trim();
}

/** Build the PR body from the agent's proposal. */
export function buildPrBody({ proposal, transcript, sourceFile, model }) {
  const lines = [];

  lines.push(proposal.summary, '');

  if (proposal.changes.length) {
    lines.push('## Changes', '');
    for (const c of proposal.changes) lines.push(`- ${c}`);
    lines.push('');
  }

  if (proposal.rateChanges.length) {
    lines.push(
      '## ⚠️ Financial figures changed — check these first',
      '',
      'These edits change numbers that customers rely on. Confirm each one against the source message before merging.',
      '',
    );
    for (const r of proposal.rateChanges) lines.push(`- [ ] ${r}`);
    lines.push('');
  }

  if (proposal.sourceQuotes.length) {
    lines.push('## Where this came from', '');
    for (const q of proposal.sourceQuotes) lines.push(`> ${q.replace(/\n/g, '\n> ')}`);
    lines.push('');
  }

  if (proposal.openQuestions?.length) {
    lines.push('## Not acted on', '');
    for (const q of proposal.openQuestions) lines.push(`- ${q}`);
    lines.push('');
  }

  lines.push(
    '<details><summary>Full conversation the agent read</summary>',
    '',
    '```',
    transcript,
    '```',
    '',
    '</details>',
    '',
    '---',
    '',
    `Opened automatically by the WhatsApp → website agent (${model}) from \`${sourceFile}\`.`,
    'Every change above was written by the agent and has not been reviewed by a person.',
  );

  return lines.join('\n');
}
