import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('notification setup', () => {
  it('runs the native setup once per session, away from the open chat', () => {
    const register = readFileSync('src/notifications/register.ts', 'utf8');
    const chat = readFileSync('src/app/(main)/chat/[id].tsx', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const reminders = readFileSync('src/notifications/sessionReminder.ts', 'utf8');
    const prompt = readFileSync('src/ui/MessageNotificationPrompt.tsx', 'utf8');
    const offRow = readFileSync('src/ui/IosNotificationOffRow.tsx', 'utf8');
    expect(register).toContain('tokenSaved');
    expect(register).toContain('permissionChecked');
    expect(register).toContain('registrationFlight');
    expect(register).toContain('notificationFailureLine');
    expect(chat).not.toContain('offerMessageNotifications');
    expect(chat).not.toContain('notifyAttempt');
    expect(chat).not.toContain('}, [repo, connection]');
    expect(chat).toContain('noteServerChatRead');
    expect(layout).toContain('bindNotificationErrorLog(repo)');
    expect(layout).toContain('retryMessageNotifications');
    expect(layout).not.toContain('offerMessageNotifications');
    expect(reminders).toContain('reportNotificationFailure');
    expect(prompt).toContain('reportNotificationFailure');
    expect(offRow).toContain('reportNotificationFailure');
    const badge = register.slice(register.indexOf('export async function setAppIconBadge'));
    expect(badge).toContain('lastBadge');
    expect(badge).toContain('clearTimeout');
    expect(badge).toContain('setBadgeCountAsync');
    expect(badge).toContain('try {');
  });
});
