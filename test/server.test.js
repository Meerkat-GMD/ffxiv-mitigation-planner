// PROTOTYPE - NOT FOR PRODUCTION

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const serverJs = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('server binds to all network interfaces by default for LAN access', () => {
    assert.match(serverJs, /const HOST = process\.env\.HOST \|\| '0\.0\.0\.0'/);
    assert.match(serverJs, /server\.listen\(PORT, HOST,/);
});

test('server prints local and LAN access URLs when listening publicly', () => {
    assert.match(serverJs, /function getAccessUrls/);
    assert.match(serverJs, /os\.networkInterfaces\(\)/);
    assert.match(serverJs, /http:\/\/localhost:\$\{port\}/);
});

test('server persists planner state on disk between restarts', () => {
    assert.match(serverJs, /const DATA_FILE = path\.join\(ROOT, 'data', 'planner-state\.json'\)/);
    assert.match(serverJs, /function loadPlannerState/);
    assert.match(serverJs, /function savePlannerState/);
    assert.match(serverJs, /savePlannerState\(plannerState\)/);
});
