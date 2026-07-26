import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parseExport, filterMessages, toTranscript, latestTimestamp } from '../src/whatsapp.js';

const IOS_EXPORT = `[19/07/2026, 9:00:00 PM] Messages and calls are end-to-end encrypted. No one outside of this chat can read them.
[19/07/2026, 10:29:56 PM] Kaushik: Board approved the new FD rate today
[19/07/2026, 10:30:12 PM] Kaushik: Long tenure FD goes from 15% to 13.5% p.a. from 1 August
[19/07/2026, 10:31:00 PM] Meena: Noted. Also update the office timing
we are open till 7 PM now, not 6
[19/07/2026, 10:32:00 PM] Meena: <Media omitted>
[19/07/2026, 10:33:00 PM] Ravi: Should we also change the MIS rate?
`;

const ANDROID_EXPORT = `19/07/2026, 10:29 pm - Kaushik: Board approved the new FD rate today
19/07/2026, 10:30 pm - Meena: Update the phone number to 7300099622
20/07/2026, 9:05 am - Ravi: This message was deleted
`;

test('parses the iOS export format', () => {
  const msgs = parseExport(IOS_EXPORT);
  assert.equal(msgs.length, 5, 'system notice is dropped, five real messages remain');
  assert.equal(msgs[0].sender, 'Kaushik');
  assert.equal(msgs[0].text, 'Board approved the new FD rate today');
  assert.equal(msgs[1].text, 'Long tenure FD goes from 15% to 13.5% p.a. from 1 August');
});

test('parses the Android export format', () => {
  const msgs = parseExport(ANDROID_EXPORT);
  assert.equal(msgs.length, 2, 'deleted-message notice is dropped');
  assert.equal(msgs[1].sender, 'Meena');
  assert.equal(msgs[1].text, 'Update the phone number to 7300099622');
});

test('joins continuation lines onto the previous message', () => {
  const msgs = parseExport(IOS_EXPORT);
  const meena = msgs.find((m) => m.text.startsWith('Noted.'));
  assert.match(meena.text, /open till 7 PM now, not 6$/);
});

test('flags attachments whose file was not exported', () => {
  const msgs = parseExport(IOS_EXPORT);
  const media = msgs.find((m) => m.hasAttachment);
  assert.ok(media, 'the <Media omitted> line is kept and flagged');
});

test('reads day-first dates and 12-hour times', () => {
  const [first] = parseExport(IOS_EXPORT);
  assert.equal(first.at.getFullYear(), 2026);
  assert.equal(first.at.getMonth(), 6, 'July');
  assert.equal(first.at.getDate(), 19);
  assert.equal(first.at.getHours(), 22, '10:29 PM is 22:00');
});

test('flips to month-first when the second field exceeds 12', () => {
  const [m] = parseExport('[07/19/2026, 1:00:00 PM] Kaushik: hello\n');
  assert.equal(m.at.getMonth(), 6, 'July');
  assert.equal(m.at.getDate(), 19);
});

test('since filter keeps only messages after the cutoff', () => {
  const msgs = parseExport(IOS_EXPORT);
  const cutoff = msgs[1].at.toISOString();
  const fresh = filterMessages(msgs, { since: cutoff });
  assert.equal(fresh.length, 3);
  assert.ok(fresh.every((m) => m.at > new Date(cutoff)));
});

test('sender allowlist excludes everyone else', () => {
  const msgs = parseExport(IOS_EXPORT);
  const fresh = filterMessages(msgs, { allowedSenders: ['kaushik'] });
  assert.equal(fresh.length, 2);
  assert.ok(fresh.every((m) => m.sender === 'Kaushik'));
});

test('an empty allowlist trusts every sender', () => {
  const msgs = parseExport(IOS_EXPORT);
  assert.equal(filterMessages(msgs, { allowedSenders: [] }).length, msgs.length);
});

test('transcript labels attachments and keeps sender names', () => {
  const t = toTranscript(parseExport(IOS_EXPORT));
  assert.match(t, /Kaushik: Board approved/);
  assert.match(t, /\[attachment not included in export\]/);
});

test('latestTimestamp returns the newest message time', () => {
  const msgs = parseExport(IOS_EXPORT);
  assert.equal(latestTimestamp(msgs), msgs[msgs.length - 1].at.toISOString());
  assert.equal(latestTimestamp([]), null);
});

test('an empty export yields no messages', () => {
  assert.deepEqual(parseExport(''), []);
});
