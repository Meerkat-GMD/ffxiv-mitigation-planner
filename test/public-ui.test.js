// PROTOTYPE - NOT FOR PRODUCTION

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf8');

test('skill editor opens as a separate hidden view instead of an inline main panel', () => {
    assert.match(html, /id="openActionEditorButton"/);
    assert.match(html, /id="actionEditorView"/);
    assert.match(html, />별칭</);
    assert.match(html, /hidden/);
    assert.doesNotMatch(html, /class="panel action-panel"/);
});

test('timeline time ruler has a context menu for adding mechanics', () => {
    assert.match(appJs, /function isTimelineTimeArea/);
    assert.match(appJs, /function showMechanicContextMenu/);
    assert.match(appJs, /function addMechanicAt/);
    assert.match(appJs, /data-add-mechanic-at/);
});

test('timeline renders clear dividers between party lanes', () => {
    assert.match(appJs, /timeline-divider/);
    assert.match(css, /\.timeline-divider/);
});

test('planner has visible controls for adding, saving, and loading plans', () => {
    assert.match(html, /id="quickAddMechanicButton"/);
    assert.match(html, /id="savePlanButton"/);
    assert.match(html, /id="loadPlanButton"/);
    assert.match(html, /id="loadPlanInput"/);
    assert.match(appJs, /function exportPlanToFile/);
    assert.match(appJs, /function importPlanFile/);
});

test('static build can use Firebase Realtime Database for shared plans', () => {
    assert.match(html, /firebase-app-compat\.js/);
    assert.match(html, /firebase-database-compat\.js/);
    assert.match(html, /firebase-config\.js/);
    assert.match(appJs, /function connectFirebase/);
    assert.match(appJs, /function connectStatic/);
    assert.match(appJs, /isLocalServerHost/);
    assert.match(appJs, /plans\/\$\{planId\}/);
    assert.match(appJs, /function loadDefaultState/);
    assert.match(appJs, /function calculatePlannerResultsClient/);
});

test('default planner state is available as a static asset for GitHub Pages', () => {
    const defaultStatePath = path.join(__dirname, '..', 'public', 'default-state.json');
    const defaultState = JSON.parse(fs.readFileSync(defaultStatePath, 'utf8'));

    assert.equal(defaultState.version, 1);
    assert.equal(defaultState.state.party.length, 8);
    assert.ok(defaultState.state.actionCatalog.length > 20);
});
