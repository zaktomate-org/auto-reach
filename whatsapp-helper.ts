import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import fs from 'fs';
import path from 'path';

export async function getExecutablePath() {
    // 1. Common system paths
    const commonPaths = [
        '/usr/bin/google-chrome',
        '/usr/bin/google-chrome-stable',
        '/usr/bin/chromium',
        '/usr/bin/chromium-browser',
        '/snap/bin/chromium'
    ];

    for (const p of commonPaths) {
        if (fs.existsSync(p)) return p;
    }

    // 2. Try 'which' command to find it in PATH
    try {
        const { execSync } = await import('child_process');
        const path = execSync('which google-chrome || which chromium-browser || which chromium', { encoding: 'utf8' }).trim();
        if (path) return path;
    } catch (e) {}

    return undefined; // Let puppeteer try its default
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

async function createClient(clientId?: string) {
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
    return client;
}

function formatToWhatsAppId(number: string): string {
    let sanitized = number.replace(/\D/g, '');
    
    // Auto-add BD country code if it looks like a local number
    if (sanitized.length === 11 && sanitized.startsWith('01')) {
        sanitized = '88' + sanitized;
    } else if (sanitized.length === 10 && sanitized.startsWith('1')) {
        sanitized = '880' + sanitized;
    }
    
    return `${sanitized}@c.us`;
}

export async function validateWhatsAppNumber(number: string): Promise<boolean> {
    const clientId = await getRandomClientId();
    const client = await createClient(clientId);

    return new Promise((resolve) => {
        const timeout = setTimeout(async () => {
            console.error('[WhatsApp] Validation timed out.');
            await client.destroy();
            resolve(false);
        }, 30000);

        client.on('ready', async () => {
            try {
                await client.pupPage.waitForFunction(() => window.Store && window.Store.BusinessProfile, { timeout: 10000 });
                
                const jid = formatToWhatsAppId(number);
                
                let isRegistered = false;
                try {
                    isRegistered = await client.isRegisteredUser(jid);
                } catch (e) {
                    const numberId = await client.getNumberId(number);
                    isRegistered = !!numberId;
                }
                
                clearTimeout(timeout);
                await client.destroy();
                resolve(isRegistered);
            } catch (err) {
                console.error('[WhatsApp] Validation error:', err);
                clearTimeout(timeout);
                await client.destroy();
                resolve(false);
            }
        });

        client.on('qr', async () => {
            console.error('[WhatsApp] Auth session expired during validation.');
            clearTimeout(timeout);
            await client.destroy();
            resolve(false);
        });

        client.initialize().catch(async () => {
            clearTimeout(timeout);
            resolve(false);
        });
    });
}

export async function sendWhatsAppViaWebJS(number: string, message: string): Promise<boolean> {
    const clientId = await getRandomClientId();
    const client = await createClient(clientId);

    return new Promise((resolve) => {
        const timeout = setTimeout(async () => {
            console.error('[WhatsApp] Send message timed out.');
            await client.destroy();
            resolve(false);
        }, 60000);

        client.on('ready', async () => {
            try {
                await client.pupPage.waitForFunction(() => window.Store && window.Store.BusinessProfile, { timeout: 10000 });
                
                const chatId = formatToWhatsAppId(number);

                await client.sendMessage(chatId, message, { waitUntilMsgSent: true });
                
                // Buffer for sync
                await new Promise(r => setTimeout(r, 5000));
                
                clearTimeout(timeout);
                await client.destroy();
                resolve(true);
            } catch (err) {
                console.error('[WhatsApp] Send error:', err);
                clearTimeout(timeout);
                await client.destroy();
                resolve(false);
            }
        });

        client.on('qr', async () => {
            console.error('[WhatsApp] Auth session expired during send.');
            clearTimeout(timeout);
            await client.destroy();
            resolve(false);
        });

        client.initialize().catch(async () => {
            clearTimeout(timeout);
            resolve(false);
        });
    });
}
