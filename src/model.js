// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const DAMAGE_TYPES = ['all', 'magical', 'physical', 'darkness'];
const TARGET_GROUPS = ['all', 'owner', 'tanks', 'healers', 'dps'];

const { DEFAULT_ACTION_CATALOG, actionKey, getJobRole, normalizeActionCatalog, normalizeJob, resolveAction } = require('./actions');

const DEFAULT_PARTY = [
    { id: 'mt', name: 'MT', role: 'tank', job: 'gnb', maxHp: 156000 },
    { id: 'st', name: 'ST', role: 'tank', job: 'drk', maxHp: 154000 },
    { id: 'h1', name: 'H1', role: 'healer', job: 'whm', maxHp: 102000 },
    { id: 'h2', name: 'H2', role: 'healer', job: 'sge', maxHp: 101000 },
    { id: 'd1', name: 'D1', role: 'dps', job: 'vpr', maxHp: 98000 },
    { id: 'd2', name: 'D2', role: 'dps', job: 'drg', maxHp: 97000 },
    { id: 'd3', name: 'D3', role: 'dps', job: 'brd', maxHp: 96000 },
    { id: 'd4', name: 'D4', role: 'dps', job: 'pct', maxHp: 95000 },
];

const DEFAULT_MECHANICS = [
    {
        id: 'm-1',
        time: 15,
        name: 'Opening raidwide',
        damage: 95000,
        damageType: 'magical',
        targetGroup: 'all',
    },
    {
        id: 'm-2',
        time: 42,
        name: 'Dual buster',
        damage: 178000,
        damageType: 'physical',
        targetGroup: 'tanks',
    },
    {
        id: 'm-3',
        time: 68,
        name: 'Phase raidwide',
        damage: 126000,
        damageType: 'darkness',
        targetGroup: 'all',
    },
];

const DEFAULT_MITIGATIONS = [
    {
        id: 'mit-1',
        ownerId: 'mt',
        name: 'Reprisal',
        start: 8,
        duration: 15,
        reduction: 10,
        damageType: 'all',
        targetGroup: 'all',
    },
    {
        id: 'mit-2',
        ownerId: 'h1',
        name: 'Addle',
        start: 62,
        duration: 10,
        reduction: 10,
        damageType: 'magical',
        targetGroup: 'all',
    },
    {
        id: 'mit-3',
        ownerId: 'mt',
        name: 'Rampart',
        start: 35,
        duration: 20,
        reduction: 20,
        damageType: 'all',
        targetGroup: 'owner',
    },
];

function normalizePlannerState(state) {
    const party = DEFAULT_PARTY.map((slot, index) => normalizeMember(normalizeArray(state.party, DEFAULT_PARTY)[index] || {}, index));
    const actionCatalog = normalizeActionCatalog(state.actionCatalog || DEFAULT_ACTION_CATALOG);

    return {
        actionCatalog,
        party,
        mechanics: normalizeArray(state.mechanics, DEFAULT_MECHANICS).map(normalizeMechanic),
        mitigations: normalizeArray(state.mitigations, DEFAULT_MITIGATIONS).map((mitigation, index) =>
            normalizeMitigation(mitigation, index, party, actionCatalog),
        ),
    };
}

function normalizeArray(value, fallback) {
    if (!Array.isArray(value) || value.length === 0) {
        return structuredClone(fallback);
    }
    return value;
}

function normalizeMember(member, index) {
    const fallback = DEFAULT_PARTY[index] || DEFAULT_PARTY[0];
    const rawJob = member.job === undefined ? fallback.job : member.job;
    const job = normalizeJob(rawJob);
    const roleFromJob = getJobRole(job);
    const role = roleFromJob || (['tank', 'healer', 'dps'].includes(member.role) ? member.role : fallback.role);

    return {
        id: fallback.id,
        name: fallback.name,
        role,
        job,
        maxHp: clampNumber(member.maxHp, fallback.maxHp, 1, 999999),
    };
}

function normalizeMechanic(mechanic, index) {
    return {
        id: String(mechanic.id || `m-${index + 1}`),
        time: quantizeSeconds(clampNumber(mechanic.time, 0, 0, 9999)),
        name: String(mechanic.name || `Mechanic ${index + 1}`),
        damage: clampNumber(mechanic.damage, 0, 0, 999999),
        damageType: DAMAGE_TYPES.includes(mechanic.damageType) && mechanic.damageType !== 'all' ? mechanic.damageType : 'magical',
        targetGroup: TARGET_GROUPS.includes(mechanic.targetGroup) ? mechanic.targetGroup : 'all',
    };
}

function normalizeMitigation(mitigation, index, party = DEFAULT_PARTY, actionCatalog = DEFAULT_ACTION_CATALOG) {
    const action = findActionForMitigation(mitigation, actionCatalog);
    const resolvedAction = action || resolveAction(mitigation.name, actionCatalog);
    const cooldown = action ? action.cooldown : clampNumber(mitigation.cooldown, resolvedAction.cooldown, 0, 9999);
    const fallbackOwner = party[0]?.id || 'mt';
    const requestedOwnerId = mitigation.ownerId === 'ot' ? 'st' : mitigation.ownerId;
    const ownerId = party.some((member) => member.id === requestedOwnerId) ? requestedOwnerId : fallbackOwner;

    return {
        id: String(mitigation.id || `mit-${index + 1}`),
        ownerId,
        name: action ? action.name : String(mitigation.name || `Mitigation ${index + 1}`),
        actionName: action ? action.name : resolvedAction.name,
        actionKey: action ? action.id : resolvedAction.key,
        start: quantizeSeconds(clampNumber(mitigation.start, 0, 0, 9999)),
        duration: quantizeSeconds(action ? action.duration : clampNumber(mitigation.duration, 10, 0, 9999)),
        cooldown: quantizeSeconds(cooldown),
        reduction: action ? action.reduction : clampNumber(mitigation.reduction, 0, 0, 100),
        damageType: action ? action.damageType : DAMAGE_TYPES.includes(mitigation.damageType) ? mitigation.damageType : 'all',
        targetGroup: action ? action.targetGroup : TARGET_GROUPS.includes(mitigation.targetGroup) ? mitigation.targetGroup : 'all',
    };
}

function findActionForMitigation(mitigation, actionCatalog = DEFAULT_ACTION_CATALOG) {
    const catalog = normalizeActionCatalog(actionCatalog);
    const key = String(mitigation.actionKey || '').trim().toLowerCase();
    if (key) {
        const byKey = catalog.find((candidate) => String(candidate.id).toLowerCase() === key || actionKey(candidate.name) === key);
        if (byKey) {
            return byKey;
        }
    }

    const resolved = resolveAction(mitigation.name, catalog);
    return catalog.find((candidate) => actionKey(candidate.name) === resolved.key) || null;
}

function quantizeSeconds(value) {
    return Math.round(Number(value) * 10) / 10;
}

function clampNumber(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
}

function calculatePlannerResults(state) {
    const normalized = normalizePlannerState(state);
    return normalized.mechanics
        .slice()
        .sort((a, b) => a.time - b.time)
        .map((mechanic) => calculateMechanicResult(mechanic, normalized.party, normalized.mitigations));
}

function calculateMechanicResult(mechanic, party, mitigations) {
    const members = {};
    let survives = true;
    let lowestRemainingHp = Infinity;
    const mechanicActiveMitigations = new Map();
    const effectiveDamageByMember = {};
    const cooldownStatuses = calculateCooldownConflicts(mitigations);

    for (const member of party) {
        const targeted = groupIncludesMember(mechanic.targetGroup, member);
        if (!targeted) {
            members[member.id] = {
                targeted: false,
                remainingHp: member.maxHp,
                effectiveDamage: 0,
                activeMitigationNames: [],
            };
            continue;
        }

        const activeMitigations = getApplicableMitigations(mechanic, mitigations, member, cooldownStatuses);
        const multiplier = activeMitigations.reduce((value, mitigation) => value * (1 - mitigation.reduction / 100), 1);
        const effectiveDamage = Math.round(mechanic.damage * multiplier);
        const remainingHp = member.maxHp - effectiveDamage;
        effectiveDamageByMember[member.id] = effectiveDamage;

        if (remainingHp <= 0) {
            survives = false;
        }
        lowestRemainingHp = Math.min(lowestRemainingHp, remainingHp);

        for (const mitigation of activeMitigations) {
            mechanicActiveMitigations.set(mitigationEffectKey(mitigation), mitigation.name);
        }

        members[member.id] = {
            targeted: true,
            remainingHp,
            effectiveDamage,
            activeMitigationNames: activeMitigations.map((mitigation) => mitigation.name),
        };
    }

    return {
        mechanic,
        survives,
        lowestRemainingHp: Number.isFinite(lowestRemainingHp) ? lowestRemainingHp : 0,
        activeMitigationNames: [...mechanicActiveMitigations.values()],
        effectiveDamageByMember,
        members,
    };
}

function calculateCooldownConflicts(mitigations) {
    const statuses = new Map();
    const sorted = mitigations
        .slice()
        .sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id)));
    const availableAtByOwnerAction = new Map();

    for (const mitigation of sorted) {
        const action = resolveAction(mitigation.actionName || mitigation.name);
        const key = mitigation.actionKey || action.key;
        const ownerId = mitigation.ownerId || 'unknown';
        const ownerActionKey = `${ownerId}:${key}`;
        const cooldown = Number(mitigation.cooldown ?? action.cooldown ?? 0);
        const start = Number(mitigation.start);
        const availableAt = availableAtByOwnerAction.get(ownerActionKey) ?? 0;
        const available = cooldown <= 0 || start >= availableAt;

        statuses.set(mitigation.id, {
            actionKey: key,
            ownerId,
            available,
            availableAt: quantizeSeconds(availableAt),
            cooldown,
        });

        if (available && cooldown > 0) {
            availableAtByOwnerAction.set(ownerActionKey, quantizeSeconds(start + cooldown));
        }
    }

    return statuses;
}

function getApplicableMitigations(mechanic, mitigations, member, cooldownStatuses = calculateCooldownConflicts(mitigations)) {
    const activeMitigations = mitigations.filter((mitigation) => {
        const start = Number(mitigation.start);
        const end = start + Number(mitigation.duration);
        const cooldownStatus = cooldownStatuses.get(mitigation.id);

        return (
            cooldownStatus?.available !== false &&
            start <= mechanic.time &&
            mechanic.time <= end &&
            mitigationMatchesDamageType(mitigation, mechanic) &&
            groupIncludesMember(mitigation.targetGroup, member, mitigation.ownerId)
        );
    });

    return selectNonStackingMitigations(activeMitigations);
}

function selectNonStackingMitigations(mitigations) {
    const selectedByEffect = new Map();
    const sorted = mitigations
        .slice()
        .sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id)));

    for (const mitigation of sorted) {
        selectedByEffect.set(mitigationEffectKey(mitigation), mitigation);
    }

    return [...selectedByEffect.values()].sort(
        (a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id)),
    );
}

function mitigationEffectKey(mitigation) {
    const action = resolveAction(mitigation.actionName || mitigation.name);
    return mitigation.actionKey || action.key || String(mitigation.name || '').trim().toLowerCase();
}

function mitigationMatchesDamageType(mitigation, mechanic) {
    return mitigation.damageType === 'all' || mitigation.damageType === mechanic.damageType;
}

function groupIncludesMember(group, member, ownerId = '') {
    if (group === 'all') {
        return true;
    }
    if (group === 'owner') {
        return member.id === ownerId;
    }
    if (group === 'tanks') {
        return member.role === 'tank';
    }
    if (group === 'healers') {
        return member.role === 'healer';
    }
    if (group === 'dps') {
        return member.role === 'dps';
    }
    return false;
}

module.exports = {
    DAMAGE_TYPES,
    TARGET_GROUPS,
    calculateCooldownConflicts,
    calculateMechanicResult,
    calculatePlannerResults,
    getApplicableMitigations,
    groupIncludesMember,
    normalizePlannerState,
    quantizeSeconds,
};
