// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');

const { getActionPresetsForMember } = require('./src/actions');
const { buildActionSearchUrl, findBestIconResult, iconAssetUrlFromResult, normalizeActionName } = require('./src/icons');
const { calculateCooldownConflicts, calculatePlannerResults, normalizePlannerState } = require('./src/model');

const PORT = Number(process.env.PORT || 5188);
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_FILE = path.join(ROOT, 'data', 'planner-state.json');
const PUBLIC_DIR = path.join(ROOT, 'public');
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

let plannerState = loadPlannerState();
const clients = new Map();
const iconCache = new Map();

const server = http.createServer(async (request, response) => {
    if (request.url === '/state.json') {
        sendJson(response, buildSnapshot());
        return;
    }

    if (request.url?.startsWith('/api/action-icon')) {
        await sendActionIcon(request, response);
        return;
    }

    if (request.url?.startsWith('/api/action-presets')) {
        const url = new URL(request.url, `http://${request.headers.host}`);
        sendJson(response, {
            presets: getActionPresetsForMember(
                url.searchParams.get('role') || '',
                url.searchParams.get('job') || '',
                plannerState.actionCatalog,
            ),
        });
        return;
    }

    const urlPath = request.url === '/' ? '/index.html' : decodeURIComponent(request.url.split('?')[0]);
    const filePath = path.normalize(path.join(PUBLIC_DIR, urlPath));

    if (!filePath.startsWith(PUBLIC_DIR)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            response.writeHead(404);
            response.end('Not found');
            return;
        }

        response.writeHead(200, { 'Content-Type': getMimeType(filePath) });
        response.end(content);
    });
});

async function sendActionIcon(request, response) {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const name = normalizeActionName(url.searchParams.get('name'));
    const cacheKey = name.toLowerCase();

    if (!name) {
        sendJson(response, { name, iconUrl: '', source: 'xivapi' });
        return;
    }

    if (iconCache.has(cacheKey)) {
        sendJson(response, iconCache.get(cacheKey));
        return;
    }

    try {
        const searchResponse = await fetch(buildActionSearchUrl(name));
        if (!searchResponse.ok) {
            throw new Error(`XIVAPI responded ${searchResponse.status}`);
        }
        const searchResult = await searchResponse.json();
        const bestResult = findBestIconResult(searchResult.results || [], name);
        const payload = {
            name,
            rowId: bestResult?.row_id || null,
            xivapiName: bestResult?.fields?.Name || '',
            iconUrl: iconAssetUrlFromResult(bestResult),
            source: 'xivapi',
        };
        iconCache.set(cacheKey, payload);
        sendJson(response, payload);
    } catch (error) {
        sendJson(response, { name, iconUrl: '', source: 'xivapi', error: error.message });
    }
}

server.on('upgrade', (request, socket) => {
    if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy();
        return;
    }

    const key = request.headers['sec-websocket-key'];
    const accept = crypto.createHash('sha1').update(key + WS_MAGIC).digest('base64');
    socket.write(
        [
            'HTTP/1.1 101 Switching Protocols',
            'Upgrade: websocket',
            'Connection: Upgrade',
            `Sec-WebSocket-Accept: ${accept}`,
            '',
            '',
        ].join('\r\n'),
    );

    const clientId = crypto.randomUUID().slice(0, 8);
    clients.set(socket, { id: clientId, buffer: Buffer.alloc(0) });

    send(socket, {
        type: 'hello',
        clientId,
        ...buildSnapshot(),
    });
    broadcastPresence();

    socket.on('data', (chunk) => {
        const client = clients.get(socket);
        if (!client) {
            return;
        }

        client.buffer = Buffer.concat([client.buffer, chunk]);
        let frame;
        while ((frame = decodeFrame(client.buffer))) {
            client.buffer = client.buffer.subarray(frame.bytesConsumed);
            if (frame.opcode === 0x8) {
                socket.end();
                return;
            }
            if (frame.opcode === 0x9) {
                socket.write(encodeFrame(0xA, frame.payload));
                continue;
            }
            if (frame.opcode === 0x1) {
                handleMessage(socket, frame.payload.toString('utf8'));
            }
        }
    });

    socket.on('close', () => {
        clients.delete(socket);
        broadcastPresence();
    });
    socket.on('error', () => {
        clients.delete(socket);
        broadcastPresence();
    });
});

server.listen(PORT, HOST, () => {
    console.log(`Mitigation Planner prototype listening on ${HOST}:${PORT}`);
    console.log('Access URLs:');
    for (const url of getAccessUrls(PORT, HOST)) {
        console.log(`- ${url}`);
    }
});

function handleMessage(socket, text) {
    let message;
    try {
        message = JSON.parse(text);
    } catch {
        send(socket, { type: 'error', message: 'Invalid JSON message' });
        return;
    }

    if (message.type === 'update') {
        plannerState = normalizePlannerState(message.state || {});
        savePlannerState(plannerState);
        broadcast({ type: 'state', ...buildSnapshot() });
    }

    if (message.type === 'reset') {
        plannerState = normalizePlannerState({});
        savePlannerState(plannerState);
        broadcast({ type: 'state', ...buildSnapshot() });
    }
}

function buildSnapshot() {
    const cooldowns = Object.fromEntries(calculateCooldownConflicts(plannerState.mitigations));
    return {
        state: plannerState,
        cooldowns,
        results: calculatePlannerResults(plannerState),
        online: clients.size,
        updatedAt: new Date().toISOString(),
    };
}

function broadcastPresence() {
    broadcast({ type: 'presence', online: clients.size });
}

function broadcast(message) {
    for (const socket of clients.keys()) {
        send(socket, message);
    }
}

function send(socket, message) {
    if (socket.destroyed) {
        return;
    }
    socket.write(encodeFrame(0x1, Buffer.from(JSON.stringify(message), 'utf8')));
}

function sendJson(response, data) {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(data, null, 2));
}

function loadPlannerState() {
    try {
        if (!fs.existsSync(DATA_FILE)) {
            return normalizePlannerState({});
        }

        const payload = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
        return normalizePlannerState(payload.state || payload);
    } catch (error) {
        console.warn(`Could not load saved planner state: ${error.message}`);
        return normalizePlannerState({});
    }
}

function savePlannerState(nextState) {
    try {
        fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
        fs.writeFileSync(
            DATA_FILE,
            JSON.stringify(
                {
                    version: 1,
                    savedAt: new Date().toISOString(),
                    state: nextState,
                },
                null,
                2,
            ),
        );
    } catch (error) {
        console.warn(`Could not save planner state: ${error.message}`);
    }
}

function getMimeType(filePath) {
    const ext = path.extname(filePath);
    if (ext === '.html') return 'text/html; charset=utf-8';
    if (ext === '.css') return 'text/css; charset=utf-8';
    if (ext === '.js') return 'application/javascript; charset=utf-8';
    if (ext === '.json') return 'application/json; charset=utf-8';
    return 'application/octet-stream';
}

function getAccessUrls(port, host) {
    if (host && host !== '0.0.0.0' && host !== '::') {
        return [`http://${host}:${port}`];
    }

    return [
        `http://localhost:${port}`,
        ...getLanAddresses().map((address) => `http://${address}:${port}`),
    ];
}

function getLanAddresses() {
    const addresses = [];

    for (const interfaces of Object.values(os.networkInterfaces())) {
        for (const item of interfaces || []) {
            if (item.family === 'IPv4' && !item.internal) {
                addresses.push(item.address);
            }
        }
    }

    return [...new Set(addresses)].sort();
}

function encodeFrame(opcode, payload) {
    const length = payload.length;
    if (length < 126) {
        return Buffer.concat([Buffer.from([0x80 | opcode, length]), payload]);
    }
    if (length < 65536) {
        const header = Buffer.alloc(4);
        header[0] = 0x80 | opcode;
        header[1] = 126;
        header.writeUInt16BE(length, 2);
        return Buffer.concat([header, payload]);
    }
    const header = Buffer.alloc(10);
    header[0] = 0x80 | opcode;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
    return Buffer.concat([header, payload]);
}

function decodeFrame(buffer) {
    if (buffer.length < 2) {
        return null;
    }

    const opcode = buffer[0] & 0x0f;
    const masked = (buffer[1] & 0x80) !== 0;
    let length = buffer[1] & 0x7f;
    let offset = 2;

    if (length === 126) {
        if (buffer.length < 4) return null;
        length = buffer.readUInt16BE(2);
        offset = 4;
    } else if (length === 127) {
        if (buffer.length < 10) return null;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
    }

    if (!masked) {
        return null;
    }

    if (buffer.length < offset + 4 + length) {
        return null;
    }

    const mask = buffer.subarray(offset, offset + 4);
    offset += 4;
    const payload = Buffer.alloc(length);
    for (let index = 0; index < length; index += 1) {
        payload[index] = buffer[offset + index] ^ mask[index % 4];
    }

    return {
        opcode,
        payload,
        bytesConsumed: offset + length,
    };
}
