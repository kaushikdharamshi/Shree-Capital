/**
 * The tools the agent can call.
 *
 * Every path the model supplies is untrusted input. `resolve()` canonicalises
 * it and refuses anything that escapes the site root or is not on the
 * editable allowlist, so a bad path fails as a tool error the model can
 * recover from rather than writing outside the repo.
 */

import fs from 'node:fs';
import path from 'node:path';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';

const MAX_READ_BYTES = 400_000;

export class ToolError extends Error {}

/**
 * @param {object} opts
 * @param {string} opts.siteRoot   absolute path to the website repo
 * @param {string[]} opts.editable glob-ish prefixes the agent may touch
 * @param {(entry: object) => void} opts.onAction called for every mutation
 */
export function createTools({ siteRoot, editable, onAction }) {
  const root = fs.realpathSync(siteRoot);
  const changed = new Set();
  /** @type {{title: string, summary: string, changes: string[], rateChanges: string[], sourceQuotes: string[]}|null} */
  let proposal = null;

  function resolve(relPath, { mustExist = true } = {}) {
    if (typeof relPath !== 'string' || relPath.trim() === '') {
      throw new ToolError('path is required');
    }
    if (path.isAbsolute(relPath)) {
      throw new ToolError(`path must be relative to the site root, got "${relPath}"`);
    }

    const full = path.resolve(root, relPath);

    // Canonicalise the deepest existing ancestor so symlinks can't escape.
    let probe = full;
    while (!fs.existsSync(probe) && probe !== path.dirname(probe)) probe = path.dirname(probe);
    const realProbe = fs.realpathSync(probe);
    if (realProbe !== root && !realProbe.startsWith(root + path.sep)) {
      throw new ToolError(`path escapes the site root: "${relPath}"`);
    }

    const rel = path.relative(root, full);
    if (rel.startsWith('..')) throw new ToolError(`path escapes the site root: "${relPath}"`);
    if (!editable.some((prefix) => rel === prefix || rel.startsWith(prefix))) {
      throw new ToolError(
        `"${rel}" is outside the editable area. Editable paths: ${editable.join(', ')}`,
      );
    }
    if (mustExist && !fs.existsSync(full)) throw new ToolError(`no such file: "${rel}"`);

    return { full, rel };
  }

  function record(action, rel, detail) {
    changed.add(rel);
    onAction?.({ action, file: rel, detail });
  }

  const listFiles = betaTool({
    name: 'list_files',
    description:
      'List the files in the website repository that can be read or edited. Call this first to see what exists.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    run: () => {
      const out = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(root, full);
          if (entry.isDirectory()) {
            walk(full);
          } else if (editable.some((p) => rel === p || rel.startsWith(p))) {
            out.push(`${rel}  (${fs.statSync(full).size} bytes)`);
          }
        }
      };
      walk(root);
      return out.sort().join('\n') || '(no editable files found)';
    },
  });

  const readFile = betaTool({
    name: 'read_file',
    description:
      'Read a file from the website repository. Always read a file before editing it so your replacement text matches exactly.',
    inputSchema: {
      type: 'object',
      properties: { path: { type: 'string', description: 'Path relative to the site root, e.g. index.html' } },
      required: ['path'],
      additionalProperties: false,
    },
    run: ({ path: relPath }) => {
      const { full, rel } = resolve(relPath);
      const { size } = fs.statSync(full);
      if (size > MAX_READ_BYTES) {
        throw new ToolError(`"${rel}" is ${size} bytes, too large to read in full. Use grep_site to locate the section instead.`);
      }
      return fs.readFileSync(full, 'utf8');
    },
  });

  const grepSite = betaTool({
    name: 'grep_site',
    description:
      'Search the editable files for a literal string and return matching lines with their file and line number. Use this to locate the exact place a value appears before editing it.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Literal text to search for, e.g. "15.00%" or "Fixed Deposit"' },
        max_results: { type: 'integer', description: 'Maximum matching lines to return (default 40)' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    run: ({ query, max_results = 40 }) => {
      const hits = [];
      const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
          const full = path.join(dir, entry.name);
          const rel = path.relative(root, full);
          if (entry.isDirectory()) {
            walk(full);
            continue;
          }
          if (!editable.some((p) => rel === p || rel.startsWith(p))) continue;
          if (!/\.(html?|css|js|md|json|txt)$/i.test(entry.name)) continue;
          const lines = fs.readFileSync(full, 'utf8').split('\n');
          lines.forEach((line, i) => {
            if (hits.length < max_results && line.includes(query)) {
              hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 200)}`);
            }
          });
        }
      };
      walk(root);
      return hits.length ? hits.join('\n') : `No matches for "${query}".`;
    },
  });

  const editFile = betaTool({
    name: 'edit_file',
    description:
      'Replace an exact string in a file. old_text must appear exactly once — include surrounding context to make it unique. This is the preferred way to change existing content.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the site root' },
        old_text: { type: 'string', description: 'Exact text to replace, including whitespace' },
        new_text: { type: 'string', description: 'Replacement text' },
      },
      required: ['path', 'old_text', 'new_text'],
      additionalProperties: false,
    },
    run: ({ path: relPath, old_text, new_text }) => {
      const { full, rel } = resolve(relPath);
      const before = fs.readFileSync(full, 'utf8');
      const count = before.split(old_text).length - 1;

      if (count === 0) throw new ToolError(`old_text not found in "${rel}". Read the file and copy the text exactly.`);
      if (count > 1) throw new ToolError(`old_text appears ${count} times in "${rel}". Add surrounding context so it is unique.`);
      if (old_text === new_text) throw new ToolError('old_text and new_text are identical — nothing to do.');

      fs.writeFileSync(full, before.replace(old_text, new_text), 'utf8');
      record('edit', rel, `${old_text.slice(0, 60).replace(/\s+/g, ' ')} → ${new_text.slice(0, 60).replace(/\s+/g, ' ')}`);
      return `Edited ${rel}.`;
    },
  });

  const writeFile = betaTool({
    name: 'write_file',
    description:
      'Create a new file, or overwrite one completely. Prefer edit_file for changes to existing files — this replaces the entire contents.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Path relative to the site root' },
        content: { type: 'string', description: 'Full file contents' },
      },
      required: ['path', 'content'],
      additionalProperties: false,
    },
    run: ({ path: relPath, content }) => {
      const { full, rel } = resolve(relPath, { mustExist: false });
      const existed = fs.existsSync(full);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content, 'utf8');
      record(existed ? 'overwrite' : 'create', rel, `${content.length} bytes`);
      return `${existed ? 'Overwrote' : 'Created'} ${rel}.`;
    },
  });

  const proposeChanges = betaTool({
    name: 'propose_changes',
    description:
      'Call this once at the very end, after all edits are done, to describe the pull request. Call it even if you made no edits — set changes to an empty list and explain why in the summary.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'One-line PR title, e.g. "Update FD rate to 13.5% and add Sunday hours"' },
        summary: {
          type: 'string',
          description: 'A few sentences in plain English: what changed and what in the conversation asked for it. If you made no changes, say why.',
        },
        changes: {
          type: 'array',
          items: { type: 'string' },
          description: 'One bullet per change, each naming the file, e.g. "index.html — FD headline rate 15.00% → 13.50%"',
        },
        rate_changes: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Every change to an interest rate, amount, tenure or other financial figure, listed again here so a human reviews them specifically. Empty if none.',
        },
        source_quotes: {
          type: 'array',
          items: { type: 'string' },
          description: 'The exact chat messages that led to these changes, quoted verbatim with the sender name.',
        },
        open_questions: {
          type: 'array',
          items: { type: 'string' },
          description: 'Anything in the conversation you could not act on because it was ambiguous or incomplete.',
        },
      },
      required: ['title', 'summary', 'changes'],
      additionalProperties: false,
    },
    run: (input) => {
      proposal = {
        title: input.title,
        summary: input.summary,
        changes: input.changes ?? [],
        rateChanges: input.rate_changes ?? [],
        sourceQuotes: input.source_quotes ?? [],
        openQuestions: input.open_questions ?? [],
      };
      return 'Proposal recorded. You are done — stop now and do not make further edits.';
    },
  });

  return {
    tools: [listFiles, readFile, grepSite, editFile, writeFile, proposeChanges],
    changedFiles: () => [...changed],
    proposal: () => proposal,
  };
}
