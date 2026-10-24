import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { fatalRecord, stackName } from './fatalError';

const SECRET = 'Meet me at the side door at nine';

describe('stored fatal errors', () => {
  it('keeps the function name and a short message, and drops the path', () => {
    const error = new Error(`ada@example.com ${SECRET}`);
    error.name = 'TypeError';
    error.stack = `TypeError: ada@example.com ${SECRET}\n    at openChat (/Users/ben/chat.tsx:12:3)\n    at secret`;
    expect(stackName(error)).toBe('openChat');
    const record = fatalRecord(error);
    expect(record.name).toBe('openChat');
    expect(record.message).not.toContain('ada@example.com');
    expect(JSON.stringify(record)).not.toContain('/Users/ben');
    expect(JSON.stringify(record)).not.toContain('chat.tsx');
    expect(JSON.stringify(record)).not.toContain('stack');
    expect(Object.keys(record).sort()).toEqual(['message', 'name']);
    const bare = new Error('missing');
    bare.stack = '';
    expect(stackName(bare)).toBe('Error');
  });

  it('saves through the global handler and uploads on the next signed-in launch', () => {
    const handler = readFileSync('src/domain/fatalError.ts', 'utf8');
    const layout = readFileSync('src/app/_layout.tsx', 'utf8');
    const boundary = readFileSync('src/ui/RootErrorBoundary.tsx', 'utf8');
    const repo = readFileSync('src/data/supabase-repository.ts', 'utf8');
    expect(handler).toContain('utils.setGlobalHandler');
    expect(handler).toContain('utils.getGlobalHandler');
    expect(handler).toContain('saveFatalLocally(error)');
    expect(handler).toContain('previous(error, isFatal)');
    expect(handler).toContain("AsyncStorage.setItem(KEY, JSON.stringify(fatalRecord(error)))");
    expect(handler).not.toContain('stack: error.stack');
    expect(handler).toContain('if (saved) await clearFatalLocally()');
    expect(layout).toContain('installFatalHandler()');
    const gateAt = layout.indexOf('if (!snap.ready || !snap.session) return');
    const uploadAt = layout.indexOf('void uploadStoredFatal');
    expect(gateAt).toBeGreaterThan(-1);
    expect(uploadAt).toBeGreaterThan(gateAt);
    expect(layout.slice(gateAt, uploadAt + 80)).toContain('uploadStoredFatal(repo, clientAppBuild');
    expect(boundary).toContain('saveFatalLocally(error)');
    expect(boundary).not.toContain('error.stack');
    expect(boundary).not.toContain('componentStack');
    const method = repo.slice(repo.indexOf('async logClientError'), repo.indexOf('async saveDeviceToken'));
    expect(method).toContain('return false');
    expect(method).toContain('return true');
    expect(method.indexOf('return false')).toBeLessThan(method.indexOf("from('client_errors')"));
  });
});
