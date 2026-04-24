import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import fs from 'fs';

async function getExecutablePath() {
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

const executablePath = await getExecutablePath();

const clientId = process.argv.find(arg => arg.startsWith('--clientId='))?.split('=')[1] || 
                 (process.argv.includes('--clientId') ? process.argv[process.argv.indexOf('--clientId') + 1] : undefined);

if (clientId) {
    console.log(`Using Client ID: ${clientId}`);
}

// Initialize the client with LocalAuth for session persistence
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: clientId,
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        executablePath: executablePath,
        handleSIGINT: false,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu'
        ],
    }
});

console.log('--- WhatsApp Auth Setup ---');

client.on('qr', (qr) => {
    console.log('QR Code received. Please scan it with your WhatsApp app:');
    qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
    console.log('Authentication successful! Session will be persisted.');
});

client.on('auth_failure', (msg) => {
    console.error('Authentication failure:', msg);
    console.log('Try deleting the ./.wwebjs_auth directory and try again.');
});

client.on('ready', () => {
    console.log('WhatsApp Client is ready and authenticated!');
    console.log('You can now use this session for automation.');
});

client.on('disconnected', (reason) => {
    console.log('Client was logged out or disconnected:', reason);
});

console.log('Initializing WhatsApp client... This might take a few seconds.');

client.initialize().catch(err => {
    console.error('Failed to initialize WhatsApp client:', err);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    try {
        await client.destroy();
        console.log('Client destroyed.');
    } catch (e) {
        console.error('Error during shutdown:', e);
    }
    process.exit(0);
});
