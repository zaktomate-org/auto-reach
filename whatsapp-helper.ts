import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';
import path from 'path';

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
        const { execSync } = await import('child_process');
        const path = execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
        if (path) return path;
    } catch (e) {}

    return undefined;
}

export async function getRandomClientId() {
    const authPath = './.wwebjs_auth';
    if (!fs.existsSync(authPath)) return undefined;

    const dirs = fs.readdirSync(authPath).filter(f => 
        fs.statSync(path.join(authPath, f)).isDirectory() && f.startsWith('session')
    );

    if (dirs.length === 0) return undefined;
    const randomDir = dirs[Math.floor(Math.random() * dirs.length)];
    return randomDir === 'session' ? undefined : randomDir.replace('session-', '');
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
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
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
        const clientId = await getRandomClientId();
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
        const clientId = await getRandomClientId();
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
