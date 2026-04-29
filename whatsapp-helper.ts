import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROTATION_STATE_FILE = './session-rotation.json';

export async function getExecutablePath() {
    const commonPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/usr/sbin/chromium',
        '/snap/bin/chromium'
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }

    try {
        const whichPath = execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
        if (whichPath) return whichPath;
    } catch (e) {}

    return undefined;
}

function getAvailableSessions(): string[] {
    const authPath = './.wwebjs_auth';
    if (!fs.existsSync(authPath)) return [];
    return fs.readdirSync(authPath).filter(f =>
        fs.statSync(path.join(authPath, f)).isDirectory() && f.startsWith('session')
    ).sort();
}

function getRotationIndex(): number {
    try {
        if (fs.existsSync(ROTATION_STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(ROTATION_STATE_FILE, 'utf-8'));
            return data.lastIndex ?? 0;
        }
    } catch (e) {}
    return 0;
}

function saveRotationIndex(index: number) {
    try {
        fs.writeFileSync(ROTATION_STATE_FILE, JSON.stringify({ lastIndex: index }));
    } catch (e) {}
}

export async function getNextClientId(): Promise<string | undefined> {
    const sessions = getAvailableSessions();
    if (sessions.length === 0) return undefined;
    if (sessions.length === 1) {
        const session = sessions[0]!;
        return session === 'session' ? undefined : session.replace('session-', '');
    }

    const index = getRotationIndex();
    const session = sessions[index % sessions.length]!;
    saveRotationIndex((index + 1) % sessions.length);

    return session === 'session' ? undefined : session.replace('session-', '');
}

export async function cleanupSessionLock(clientId?: string) {
    const sessionDirName = clientId ? `session-${clientId}` : 'session';
    const sessionPath = path.resolve('./.wwebjs_auth', sessionDirName);

    if (!fs.existsSync(sessionPath)) return;

    try {
        const lockFile = path.join(sessionPath, 'SingletonLock');
        const socketFile = path.join(sessionPath, 'SingletonSocket');
        const cookieFile = path.join(sessionPath, 'SingletonCookie');

        const staleProcesses = findChromeProcesses(sessionPath);
        for (const pid of staleProcesses) {
            try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch {}
        }

        await new Promise(r => setTimeout(r, 500));

        for (const lockPath of [lockFile, socketFile, cookieFile]) {
            if (fs.existsSync(lockPath)) {
                try { fs.unlinkSync(lockPath); } catch {}
            }
        }
    } catch (e) {
        console.error(`[WhatsApp] Failed to cleanup session lock for ${sessionDirName}:`, (e as Error).message);
    }
}

function findChromeProcesses(sessionPath: string): string[] {
    try {
        const output = execSync('ps aux', { encoding: 'utf8' });
        const lines = output.split('\n');
        const pids: string[] = [];
        for (const line of lines) {
            if (!line.includes('chrome') && !line.includes('chromium')) continue;
            const parts = line.trim().split(/\s+/);
            const pid = parts[1];
            const ppid = parts[3];
            if (!pid) continue;
            if (ppid === '1') {
                pids.push(pid);
                continue;
            }
            try {
                const parentCmd = execSync(`ps -o cmd= -p ${ppid}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
                if (!parentCmd) pids.push(pid);
            } catch {
                pids.push(pid);
            }
        }
        return pids;
    } catch {
        return [];
    }
}

export function formatToWhatsAppId(number: string): string {
    let sanitized = number.replace(/\D/g, '');
    if (sanitized.length === 11 && sanitized.startsWith('01')) {
        sanitized = '88' + sanitized;
    } else if (sanitized.length === 10 && sanitized.startsWith('1')) {
        sanitized = '880' + sanitized;
    }
    return `${sanitized}@c.us`;
}

// ── New Modular Logic ─────────────────────────────────────

export async function initWhatsAppClient(clientId?: string): Promise<any> {
    await cleanupSessionLock(clientId);

    const executablePath = await getExecutablePath();
    const client = new Client({
        authStrategy: new LocalAuth({
            clientId: clientId,
            dataPath: './.wwebjs_auth'
        }),
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html'
        },
        puppeteer: {
            executablePath: executablePath,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
        }
    });

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error('WhatsApp initialization timed out after 300s'));
        }, 300000);

        client.on('ready', () => {
            clearTimeout(timeout);
            resolve(client);
        });

        client.on('qr', () => {
            clearTimeout(timeout);
            reject(new Error('WhatsApp session expired (QR needed)'));
        });

        client.initialize().catch(reject);
    });
}

export async function checkRegistration(client: any, number: string): Promise<boolean> {
    const jid = formatToWhatsAppId(number);
    try {
        // Try standard check
        const isRegistered = await client.isRegisteredUser(jid);
        if (isRegistered) return true;

        // Fallback to getNumberId for Business/LID accounts
        const fullNumber = jid.split('@')[0];
        const numberId = await client.getNumberId(fullNumber);
        return !!numberId;
    } catch (e) {
        console.error(`[WhatsApp] Registration check failed for ${number}:`, e.message);
        return false;
    }
}

export async function sendMessage(client: any, number: string, message: string): Promise<boolean> {
    const chatId = formatToWhatsAppId(number);
    try {
        await client.sendMessage(chatId, message, { waitUntilMsgSent: true });
        // Buffer for sync
        await new Promise(r => setTimeout(r, 2000));
        return true;
    } catch (err) {
        console.error(`[WhatsApp] Send error for ${number}:`, err.message);
        return false;
    }
}

// ── Compatibility Wrappers (Keep existing API) ─────────────

export async function validateWhatsAppNumber(number: string): Promise<boolean> {
    let client;
    try {
        const clientId = await getNextClientId();
        client = await initWhatsAppClient(clientId);
        const result = await checkRegistration(client, number);
        await new Promise(r => setTimeout(r, 2000));
        await client.destroy();
        return result;
    } catch (e) {
        if (client) await client.destroy();
        return false;
    }
}

export async function sendWhatsAppViaWebJS(number: string, message: string): Promise<boolean> {
    let client;
    try {
        const clientId = await getNextClientId();
        client = await initWhatsAppClient(clientId);
        const result = await sendMessage(client, number, message);
        await new Promise(r => setTimeout(r, 2000));
        await client.destroy();
        return result;
    } catch (e) {
        if (client) await client.destroy();
        return false;
    }
}
