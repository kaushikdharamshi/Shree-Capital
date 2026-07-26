/**
 * Parser for WhatsApp "Export chat" .txt files.
 *
 * WhatsApp writes two different formats depending on the phone. Both are
 * handled here:
 *
 *   iOS      [19/07/2026, 10:29:56 PM] Kaushik: message text
 *   Android  19/07/2026, 10:29 pm - Kaushik: message text
 *
 * A message can span several lines; any line that does not start with a
 * timestamp is a continuation of the previous one.
 */

import fs from 'node:fs';

/* iOS: leading [ ... ] block, optional seconds, optional am/pm */
const IOS = /^‎?\[(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm])?\]\s*([^:]{1,80}?):\s?([\s\S]*)$/;

/* Android: date, time, " - ", sender, ": " */
const ANDROID = /^‎?(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([APap][Mm]|[ap]\.?m\.?)?\s+-\s+([^:]{1,80}?):\s?([\s\S]*)$/;

/* A timestamped line with no "sender:" — a system notice, not a message */
const SYSTEM = /^‎?(\[?\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2})/;

/** Lines WhatsApp inserts itself — never user content. */
const SYSTEM_TEXT = [
  /end-to-end encrypted/i,
  /^messages and calls are/i,
  /created group/i,
  /added you/i,
  /changed the subject/i,
  /changed this group's icon/i,
  /joined using this group's invite link/i,
  /left$/i,
  /you deleted this message/i,
  /this message was deleted/i,
  /security code changed/i,
  /changed their phone number/i,
];

/** Placeholders where the actual file was not included in the export. */
const ATTACHMENT = [
  /<Media omitted>/i,
  /(image|video|audio|sticker|document|GIF|Contact card) omitted/i,
  /\(file attached\)$/i,
];

function stripInvisible(s) {
  // WhatsApp sprinkles LRM/RLM/zero-width marks through exported lines.
  return s.replace(/[‎‏‪-‮﻿]/g, '');
}

/**
 * Build a Date from the pieces of a timestamp line.
 * WhatsApp exports use the phone's locale, so a bare "07/19" is ambiguous.
 * Day-first is assumed (the Indian default); a value above 12 in the first
 * position confirms it, and above 12 in the second position flips it.
 */
function toDate(d, m, y, hh, mm, ss, ampm) {
  let day = Number(d);
  let month = Number(m);
  if (day <= 12 && month > 12) [day, month] = [month, day];

  let year = Number(y);
  if (year < 100) year += 2000;

  let hours = Number(hh);
  if (ampm) {
    const pm = /p/i.test(ampm);
    if (pm && hours < 12) hours += 12;
    if (!pm && hours === 12) hours = 0;
  }

  return new Date(year, month - 1, day, hours, Number(mm), Number(ss || 0));
}

function matchLine(line) {
  const m = IOS.exec(line) || ANDROID.exec(line);
  if (!m) return null;
  const [, d, mo, y, hh, mm, ss, ampm, sender, text] = m;
  return {
    at: toDate(d, mo, y, hh, mm, ss, ampm),
    sender: stripInvisible(sender).trim(),
    text: stripInvisible(text),
  };
}

/**
 * Parse an exported chat into messages.
 * @param {string} raw contents of the .txt export
 * @returns {{at: Date, sender: string, text: string, hasAttachment: boolean}[]}
 */
export function parseExport(raw) {
  const lines = raw.split(/\r?\n/);
  const messages = [];

  for (const line of lines) {
    const parsed = matchLine(line);

    if (parsed) {
      messages.push({ ...parsed, hasAttachment: false });
      continue;
    }

    if (SYSTEM.test(line)) continue; // timestamped system notice, no sender

    // Continuation of the message above it.
    if (messages.length && line.trim() !== '') {
      messages[messages.length - 1].text += '\n' + stripInvisible(line);
    }
  }

  return messages
    .map((m) => {
      const hasAttachment = ATTACHMENT.some((re) => re.test(m.text));
      return { ...m, text: m.text.trim(), hasAttachment };
    })
    .filter((m) => m.text !== '')
    .filter((m) => !SYSTEM_TEXT.some((re) => re.test(m.text)));
}

/** Parse a file from disk. */
export function parseExportFile(path) {
  return parseExport(fs.readFileSync(path, 'utf8'));
}

/**
 * Drop messages already handled on a previous run, and any sender not on the
 * allowlist. An empty allowlist means "trust everyone in the chat".
 *
 * @param {object[]} messages
 * @param {{ since?: string|null, allowedSenders?: string[] }} opts
 */
export function filterMessages(messages, { since = null, allowedSenders = [] } = {}) {
  const cutoff = since ? new Date(since) : null;
  const allow = allowedSenders.map((s) => s.toLowerCase().trim()).filter(Boolean);

  return messages.filter((m) => {
    if (cutoff && !(m.at > cutoff)) return false;
    if (allow.length && !allow.includes(m.sender.toLowerCase())) return false;
    return true;
  });
}

/** Render messages as a transcript for the model, one message per line. */
export function toTranscript(messages) {
  return messages
    .map((m) => {
      const when = m.at.toISOString().slice(0, 16).replace('T', ' ');
      const body = m.hasAttachment ? `${m.text}  [attachment not included in export]` : m.text;
      return `[${when}] ${m.sender}: ${body}`;
    })
    .join('\n');
}

/** ISO timestamp of the newest message, for the run-state file. */
export function latestTimestamp(messages) {
  if (!messages.length) return null;
  return new Date(Math.max(...messages.map((m) => m.at.getTime()))).toISOString();
}
