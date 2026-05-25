// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const assert = require('node:assert/strict');
const test = require('node:test');

const {
    calculateMechanicResult,
    calculateCooldownConflicts,
    getApplicableMitigations,
    normalizePlannerState,
} = require('../src/model');

test('finds mitigations active at the mechanic time and matching damage type', () => {
    const mechanic = {
        id: 'm1',
        time: 45,
        name: 'Raidwide',
        damage: 120000,
        damageType: 'magical',
        targetGroup: 'all',
    };
    const mitigations = [
        {
            id: 'reprisal',
            name: 'Reprisal',
            start: 35,
            duration: 15,
            reduction: 10,
            damageType: 'all',
            targetGroup: 'all',
        },
        {
            id: 'addle',
            name: 'Addle',
            start: 38,
            duration: 10,
            reduction: 10,
            damageType: 'magical',
            targetGroup: 'all',
        },
        {
            id: 'feint',
            name: 'Feint',
            start: 38,
            duration: 10,
            reduction: 10,
            damageType: 'physical',
            targetGroup: 'all',
        },
        {
            id: 'expired',
            name: 'Expired',
            start: 10,
            duration: 8,
            reduction: 10,
            damageType: 'all',
            targetGroup: 'all',
        },
    ];

    assert.deepEqual(
        getApplicableMitigations(mechanic, mitigations, {
            id: 'p1',
            role: 'healer',
            maxHp: 100000,
        }).map((mitigation) => mitigation.id),
        ['reprisal', 'addle'],
    );
});

test('calculates multiplicative mitigation and survival for each targeted player', () => {
    const result = calculateMechanicResult(
        {
            id: 'm1',
            time: 45,
            name: 'Raidwide',
            damage: 120000,
            damageType: 'magical',
            targetGroup: 'all',
        },
        [
            { id: 'mt', name: 'MT', role: 'tank', maxHp: 155000 },
            { id: 'h1', name: 'H1', role: 'healer', maxHp: 100000 },
            { id: 'd1', name: 'D1', role: 'dps', maxHp: 96000 },
        ],
        [
            {
                id: 'reprisal',
                name: 'Reprisal',
                start: 35,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
            {
                id: 'addle',
                name: 'Addle',
                start: 38,
                duration: 10,
                reduction: 10,
                damageType: 'magical',
                targetGroup: 'all',
            },
        ],
    );

    assert.equal(result.effectiveDamageByMember.h1, 97200);
    assert.equal(result.members.h1.remainingHp, 2800);
    assert.equal(result.members.d1.remainingHp, -1200);
    assert.equal(result.survives, false);
    assert.equal(result.lowestRemainingHp, -1200);
    assert.deepEqual(result.activeMitigationNames, ['Reprisal', 'Addle']);
});

test('target groups restrict mechanics and mitigations', () => {
    const result = calculateMechanicResult(
        {
            id: 'm2',
            time: 60,
            name: 'Tank Buster',
            damage: 180000,
            damageType: 'physical',
            targetGroup: 'tanks',
        },
        [
            { id: 'mt', name: 'MT', role: 'tank', maxHp: 180000 },
            { id: 'h1', name: 'H1', role: 'healer', maxHp: 100000 },
        ],
        [
            {
                id: 'rampart',
                name: 'Rampart',
                start: 50,
                duration: 20,
                reduction: 20,
                damageType: 'all',
                targetGroup: 'tanks',
            },
            {
                id: 'temperance',
                name: 'Temperance',
                start: 50,
                duration: 20,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'healers',
            },
        ],
    );

    assert.equal(result.members.mt.remainingHp, 36000);
    assert.equal(result.members.h1.targeted, false);
    assert.deepEqual(result.members.mt.activeMitigationNames, ['Rampart']);
});

test('normalizes partial planner state with default party, mechanics, and mitigations', () => {
    const normalized = normalizePlannerState({});

    assert.equal(normalized.party.length, 8);
    assert.deepEqual(
        normalized.party.map((member) => member.name),
        ['MT', 'ST', 'H1', 'H2', 'D1', 'D2', 'D3', 'D4'],
    );
    assert.ok(normalized.mechanics.length >= 3);
    assert.ok(normalized.mitigations.length >= 3);
    assert.ok(normalized.actionCatalog.length > 20);
});

test('normalizes party jobs and derives role from selected job', () => {
    const normalized = normalizePlannerState({
        party: [
            { id: 'slot1', name: 'Slot 1', role: 'dps', job: 'pld', maxHp: 150000 },
            { id: 'slot2', name: 'Slot 2', role: 'tank', job: 'sch', maxHp: 100000 },
            { id: 'slot3', name: 'Slot 3', role: 'dps', job: 'unknown', maxHp: 100000 },
        ],
        mechanics: [],
        mitigations: [],
    });

    assert.equal(normalized.party[0].id, 'mt');
    assert.equal(normalized.party[0].name, 'MT');
    assert.equal(normalized.party[0].job, 'pld');
    assert.equal(normalized.party[0].role, 'tank');
    assert.equal(normalized.party[1].id, 'st');
    assert.equal(normalized.party[1].name, 'ST');
    assert.equal(normalized.party[1].job, 'sch');
    assert.equal(normalized.party[1].role, 'healer');
    assert.equal(normalized.party[2].job, '');
    assert.equal(normalized.party[2].role, 'dps');
});

test('migrates old OT slot ownership to fixed ST slot', () => {
    const normalized = normalizePlannerState({
        party: [
            { id: 'mt', name: 'MT', role: 'tank', job: 'gnb', maxHp: 150000 },
            { id: 'ot', name: 'OT', role: 'tank', job: 'drk', maxHp: 150000 },
        ],
        mechanics: [],
        mitigations: [
            {
                id: 'old-ot',
                ownerId: 'ot',
                name: 'Rampart',
                start: 10,
                duration: 20,
                reduction: 20,
                damageType: 'all',
                targetGroup: 'owner',
            },
        ],
    });

    assert.equal(normalized.party[1].id, 'st');
    assert.equal(normalized.party[1].name, 'ST');
    assert.equal(normalized.mitigations[0].ownerId, 'st');
});

test('owner target group applies mitigation only to the skill owner', () => {
    const result = calculateMechanicResult(
        {
            id: 'm1',
            time: 15,
            name: 'Shared hit',
            damage: 100000,
            damageType: 'physical',
            targetGroup: 'tanks',
        },
        [
            { id: 'mt', name: 'MT', role: 'tank', maxHp: 120000 },
            { id: 'st', name: 'ST', role: 'tank', maxHp: 120000 },
        ],
        [
            {
                id: 'rampart',
                ownerId: 'mt',
                name: 'Rampart',
                start: 10,
                duration: 20,
                reduction: 20,
                damageType: 'all',
                targetGroup: 'owner',
            },
        ],
    );

    assert.equal(result.members.mt.effectiveDamage, 80000);
    assert.equal(result.members.st.effectiveDamage, 100000);
});

test('normalizes timeline seconds to one decimal place', () => {
    const normalized = normalizePlannerState({
        party: [{ id: 'p1', name: 'P1', role: 'dps', maxHp: 100000 }],
        mechanics: [
            {
                id: 'm1',
                time: 12.34,
                name: 'Decimal raidwide',
                damage: 100000,
                damageType: 'magical',
                targetGroup: 'all',
            },
        ],
        mitigations: [
            {
                id: 'mit1',
                name: 'Decimal mitigation',
                start: 8.26,
                duration: 14.94,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
        ],
    });

    assert.equal(normalized.mechanics[0].time, 12.3);
    assert.equal(normalized.mitigations[0].start, 8.3);
    assert.equal(normalized.mitigations[0].duration, 14.9);
});

test('normalizes known mitigation cooldowns and canonical action keys', () => {
    const normalized = normalizePlannerState({
        party: [{ id: 'p1', name: 'P1', role: 'dps', maxHp: 100000 }],
        mechanics: [],
        mitigations: [
            {
                id: 'reprisal-kr',
                name: '앙갚음',
                start: 10,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
        ],
    });

    assert.equal(normalized.mitigations[0].actionName, 'Reprisal');
    assert.equal(normalized.mitigations[0].actionKey, 'reprisal');
    assert.equal(normalized.mitigations[0].cooldown, 60);
});

test('uses shared action catalog values for existing mitigations with matching action keys', () => {
    const normalized = normalizePlannerState({
        actionCatalog: [
            {
                id: 'reprisal',
                name: 'Edited Reprisal',
                cooldown: 80,
                duration: 22,
                reduction: 15,
                damageType: 'magical',
                targetGroup: 'all',
                jobs: ['gnb'],
                aliases: ['Reprisal'],
            },
        ],
        party: [{ id: 'mt', name: 'MT', role: 'tank', job: 'gnb', maxHp: 100000 }],
        mechanics: [],
        mitigations: [
            {
                id: 'placed-reprisal',
                ownerId: 'mt',
                actionKey: 'reprisal',
                name: 'Reprisal',
                start: 10,
                duration: 5,
                cooldown: 10,
                reduction: 1,
                damageType: 'all',
                targetGroup: 'owner',
            },
        ],
    });

    assert.equal(normalized.mitigations[0].name, 'Edited Reprisal');
    assert.equal(normalized.mitigations[0].actionName, 'Edited Reprisal');
    assert.equal(normalized.mitigations[0].actionKey, 'reprisal');
    assert.equal(normalized.mitigations[0].cooldown, 80);
    assert.equal(normalized.mitigations[0].duration, 22);
    assert.equal(normalized.mitigations[0].reduction, 15);
    assert.equal(normalized.mitigations[0].damageType, 'magical');
    assert.equal(normalized.mitigations[0].targetGroup, 'all');
});

test('marks repeated mitigation uses inside cooldown as unavailable', () => {
    const mitigations = normalizePlannerState({
        party: [{ id: 'p1', name: 'P1', role: 'dps', maxHp: 100000 }],
        mechanics: [],
        mitigations: [
            {
                id: 'first',
                name: 'Reprisal',
                start: 10,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
            {
                id: 'second',
                name: '앙갚음',
                start: 50,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
            {
                id: 'third',
                name: 'Reprisal',
                start: 70,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
        ],
    }).mitigations;

    const conflicts = calculateCooldownConflicts(mitigations);

    assert.equal(conflicts.get('first')?.available, true);
    assert.equal(conflicts.get('second')?.available, false);
    assert.equal(conflicts.get('second')?.availableAt, 70);
    assert.equal(conflicts.get('third')?.available, true);
});

test('tracks cooldown separately for each party member using the same action', () => {
    const mitigations = normalizePlannerState({
        party: [
            { id: 'mt', name: 'MT', role: 'tank', maxHp: 150000 },
            { id: 'ot', name: 'OT', role: 'tank', maxHp: 150000 },
        ],
        mechanics: [],
        mitigations: [
            {
                id: 'mt-reprisal',
                ownerId: 'mt',
                name: 'Reprisal',
                start: 10,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
            {
                id: 'ot-reprisal',
                ownerId: 'ot',
                name: 'Reprisal',
                start: 20,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
            {
                id: 'mt-reprisal-too-soon',
                ownerId: 'mt',
                name: 'Reprisal',
                start: 50,
                duration: 15,
                reduction: 10,
                damageType: 'all',
                targetGroup: 'all',
            },
        ],
    }).mitigations;

    const conflicts = calculateCooldownConflicts(mitigations);

    assert.equal(conflicts.get('mt-reprisal')?.available, true);
    assert.equal(conflicts.get('ot-reprisal')?.available, true);
    assert.equal(conflicts.get('mt-reprisal-too-soon')?.available, false);
    assert.equal(conflicts.get('mt-reprisal-too-soon')?.availableAt, 70);
});

test('does not apply mitigation uses that are still on cooldown', () => {
    const result = calculateMechanicResult(
        {
            id: 'm1',
            time: 52,
            name: 'Raidwide',
            damage: 100000,
            damageType: 'magical',
            targetGroup: 'all',
        },
        [{ id: 'p1', name: 'P1', role: 'dps', maxHp: 100000 }],
        normalizePlannerState({
            party: [{ id: 'p1', name: 'P1', role: 'dps', maxHp: 100000 }],
            mechanics: [],
            mitigations: [
                {
                    id: 'first',
                    name: 'Reprisal',
                    start: 10,
                    duration: 15,
                    reduction: 10,
                    damageType: 'all',
                    targetGroup: 'all',
                },
                {
                    id: 'second',
                    name: 'Reprisal',
                    start: 50,
                    duration: 15,
                    reduction: 10,
                    damageType: 'all',
                    targetGroup: 'all',
                },
            ],
        }).mitigations,
    );

    assert.deepEqual(result.activeMitigationNames, []);
    assert.equal(result.members.p1.remainingHp, 0);
});
