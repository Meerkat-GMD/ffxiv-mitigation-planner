// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    getActionPresetsForMember,
    getActionPresetsForRole,
    getJobRole,
    normalizeActionCatalog,
    resolveAction,
} = require('../src/actions');

test('resolves Korean mitigation aliases from the official PvE job guide to XIVAPI English action names', () => {
    assert.equal(resolveAction('앙갚음').name, 'Reprisal');
    assert.equal(resolveAction('철벽 방어').name, 'Rampart');
    assert.equal(resolveAction('정신 교란').name, 'Addle');
    assert.equal(resolveAction('견제').name, 'Feint');
    assert.equal(resolveAction('신성한 보호막').name, 'Divine Veil');
    assert.equal(resolveAction('신성한 방벽').name, 'Holy Sheltron');
    assert.equal(resolveAction('극한 방어').name, 'Guardian');
    assert.equal(resolveAction('빛의 심장').name, 'Heart of Light');
    assert.equal(resolveAction('돌의 심장').name, 'Heart of Corundum');
    assert.equal(resolveAction('야전치유진').name, 'Sacred Soil');
    assert.equal(resolveAction('바매직').name, 'Magick Barrier');
});

test('returns known cooldown values for mitigation actions', () => {
    assert.equal(resolveAction('Reprisal').cooldown, 60);
    assert.equal(resolveAction('Addle').cooldown, 90);
    assert.equal(resolveAction('Rampart').cooldown, 90);
    assert.equal(resolveAction('바매직').cooldown, 120);
});

test('falls back to the typed name for unknown actions', () => {
    assert.deepEqual(resolveAction('Custom Mit'), {
        aliases: [],
        cooldown: 0,
        key: 'custom mit',
        name: 'Custom Mit',
    });
});

test('returns role-specific mitigation presets for timeline context menus', () => {
    assert.ok(getActionPresetsForRole('tank').some((preset) => preset.name === 'Reprisal'));
    assert.ok(getActionPresetsForRole('tank').some((preset) => preset.name === 'Rampart'));
    assert.ok(getActionPresetsForRole('healer').some((preset) => preset.name === 'Temperance'));
    assert.ok(getActionPresetsForRole('dps').some((preset) => preset.name === 'Feint'));
    assert.ok(getActionPresetsForRole('dps').some((preset) => preset.name === 'Addle'));
});

test('returns job-specific mitigation presets for timeline context menus', () => {
    const gunbreaker = getActionPresetsForMember('tank', 'gnb').map((preset) => preset.name);
    assert.ok(gunbreaker.includes('Reprisal'));
    assert.ok(gunbreaker.includes('Rampart'));
    assert.ok(gunbreaker.includes('Heart of Light'));
    assert.ok(gunbreaker.includes('Heart of Corundum'));
    assert.ok(!gunbreaker.includes('Dark Missionary'));

    const redMage = getActionPresetsForMember('dps', 'rdm').map((preset) => preset.name);
    assert.ok(redMage.includes('Addle'));
    assert.ok(redMage.includes('Magick Barrier'));
    assert.ok(!redMage.includes('Feint'));
});

test('returns shield presets with potency metadata for scholar barriers', () => {
    const scholar = getActionPresetsForMember('healer', 'sch');
    const adloquium = scholar.find((preset) => preset.name === 'Adloquium');
    const concitation = scholar.find((preset) => preset.name === 'Concitation');

    assert.equal(resolveAction('고무격려책').name, 'Adloquium');
    assert.equal(resolveAction('의기왕성책').name, 'Concitation');
    assert.equal(adloquium.shieldPotency, 540);
    assert.equal(concitation.shieldPotency, 360);
    assert.equal(concitation.shieldBaseActionKey, 'adloquium');
});

test('resolves FFXIV jobs to planner roles', () => {
    assert.equal(getJobRole('pld'), 'tank');
    assert.equal(getJobRole('SCH'), 'healer');
    assert.equal(getJobRole('vpr'), 'dps');
    assert.equal(getJobRole('unknown'), '');
});

test('uses editable action catalog entries when resolving and filtering presets', () => {
    const catalog = normalizeActionCatalog([
        {
            id: 'custom-rdm',
            name: 'Custom RDM Barrier',
            cooldown: 42,
            duration: 8,
                reduction: 12,
                shieldPotency: 500,
                shieldBaseActionKey: 'custom-rdm',
                damageType: 'magical',
                targetGroup: 'all',
                jobs: ['rdm'],
        },
    ]);

    assert.deepEqual(getActionPresetsForMember('dps', 'rdm', catalog).map((preset) => preset.name), [
        'Custom RDM Barrier',
    ]);
    assert.equal(getActionPresetsForMember('dps', 'rdm', catalog)[0].shieldPotency, 500);
    assert.equal(getActionPresetsForMember('dps', 'rdm', catalog)[0].shieldBaseActionKey, 'custom-rdm');
    assert.deepEqual(getActionPresetsForMember('dps', 'blm', catalog), []);
    assert.equal(resolveAction('Custom RDM Barrier', catalog).cooldown, 42);
});
