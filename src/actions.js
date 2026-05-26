// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const DAMAGE_TYPES = ['all', 'magical', 'physical', 'darkness'];
const TARGET_GROUPS = ['all', 'owner', 'tanks', 'healers', 'dps'];

const JOBS = [
    { id: 'pld', name: 'PLD', role: 'tank' },
    { id: 'war', name: 'WAR', role: 'tank' },
    { id: 'drk', name: 'DRK', role: 'tank' },
    { id: 'gnb', name: 'GNB', role: 'tank' },
    { id: 'whm', name: 'WHM', role: 'healer' },
    { id: 'sch', name: 'SCH', role: 'healer' },
    { id: 'ast', name: 'AST', role: 'healer' },
    { id: 'sge', name: 'SGE', role: 'healer' },
    { id: 'mnk', name: 'MNK', role: 'dps' },
    { id: 'drg', name: 'DRG', role: 'dps' },
    { id: 'nin', name: 'NIN', role: 'dps' },
    { id: 'sam', name: 'SAM', role: 'dps' },
    { id: 'rpr', name: 'RPR', role: 'dps' },
    { id: 'vpr', name: 'VPR', role: 'dps' },
    { id: 'brd', name: 'BRD', role: 'dps' },
    { id: 'mch', name: 'MCH', role: 'dps' },
    { id: 'dnc', name: 'DNC', role: 'dps' },
    { id: 'blm', name: 'BLM', role: 'dps' },
    { id: 'smn', name: 'SMN', role: 'dps' },
    { id: 'rdm', name: 'RDM', role: 'dps' },
    { id: 'pct', name: 'PCT', role: 'dps' },
];

const DEFAULT_ACTION_CATALOG = [
    entry('reprisal', 'Reprisal', 60, 15, 10, 'all', 'all', ['pld', 'war', 'drk', 'gnb'], ['앙갚음']),
    entry('rampart', 'Rampart', 90, 20, 20, 'all', 'owner', ['pld', 'war', 'drk', 'gnb'], [
        '철벽 방어',
        '철벽방어',
    ]),
    entry('guardian', 'Guardian', 120, 15, 40, 'all', 'owner', ['pld'], ['극한 방어', '경계']),
    entry('hallowed-ground', 'Hallowed Ground', 420, 10, 100, 'all', 'owner', ['pld'], ['천하무적']),
    entry('holy-sheltron', 'Holy Sheltron', 5, 8, 15, 'all', 'owner', ['pld'], ['신성한 방벽', '방벽']),
    entry('intervention', 'Intervention', 10, 8, 10, 'all', 'owner', ['pld'], ['중재']),
    entry('divine-veil', 'Divine Veil', 90, 30, 10, 'all', 'all', ['pld'], ['신성한 보호막']),
    entry('passage-of-arms', 'Passage of Arms', 120, 18, 15, 'all', 'all', ['pld'], ['결연한 수호자']),
    entry('vengeance', 'Vengeance', 120, 15, 30, 'physical', 'owner', ['war'], ['보복']),
    entry('damnation', 'Damnation', 120, 15, 40, 'all', 'owner', ['war'], ['원초의 분노']),
    entry('holmgang', 'Holmgang', 240, 10, 100, 'all', 'owner', ['war'], ['일대일 결투']),
    entry('bloodwhetting', 'Bloodwhetting', 25, 8, 10, 'all', 'owner', ['war'], ['혈기']),
    entry('nascent-flash', 'Nascent Flash', 25, 8, 10, 'all', 'owner', ['war'], ['원초의 혈기']),
    entry('shake-it-off', 'Shake It Off', 90, 30, 15, 'all', 'all', ['war'], ['뿌리치기']),
    entry('shadow-wall', 'Shadow Wall', 120, 15, 30, 'all', 'owner', ['drk'], ['어둠의 장벽']),
    entry('living-dead', 'Living Dead', 300, 10, 100, 'all', 'owner', ['drk'], ['산송장']),
    entry('dark-mind', 'Dark Mind', 60, 10, 20, 'magical', 'owner', ['drk'], ['어두운 감정']),
    entry('the-blackest-night', 'The Blackest Night', 15, 7, 25, 'all', 'owner', ['drk'], ['흑야']),
    entry('oblation', 'Oblation', 60, 10, 10, 'all', 'owner', ['drk'], ['헌신']),
    entry('dark-missionary', 'Dark Missionary', 90, 15, 10, 'magical', 'all', ['drk'], ['어둠의 포교자']),
    entry('nebula', 'Nebula', 120, 15, 30, 'all', 'owner', ['gnb'], ['성운']),
    entry('great-nebula', 'Great Nebula', 120, 15, 40, 'all', 'owner', ['gnb'], ['대성운']),
    entry('superbolide', 'Superbolide', 360, 10, 100, 'all', 'owner', ['gnb'], ['초신성']),
    entry('camouflage', 'Camouflage', 90, 20, 10, 'all', 'owner', ['gnb'], ['위장술']),
    entry('heart-of-corundum', 'Heart of Corundum', 25, 8, 15, 'all', 'owner', ['gnb'], [
        '강옥의 심장',
        '돌의 심장',
    ]),
    entry('heart-of-light', 'Heart of Light', 90, 15, 10, 'magical', 'all', ['gnb'], ['빛의 심장']),
    entry('aquaveil', 'Aquaveil', 60, 8, 15, 'all', 'owner', ['whm'], ['물의 장막']),
    entry('divine-benison', 'Divine Benison', 30, 15, 0, 'all', 'owner', ['whm'], ['신의 이름'], {
        shieldBaseActionKey: 'divine-benison',
        shieldPotency: 500,
    }),
    entry('divine-caress', 'Divine Caress', 1, 10, 0, 'all', 'all', ['whm'], ['신성한 손길'], {
        shieldBaseActionKey: 'divine-benison',
        shieldPotency: 400,
    }),
    entry('temperance', 'Temperance', 120, 20, 10, 'all', 'all', ['whm'], ['절제']),
    entry('adloquium', 'Adloquium', 2.5, 30, 0, 'all', 'owner', ['sch'], ['고무격려책'], {
        shieldBaseActionKey: 'adloquium',
        shieldPotency: 540,
    }),
    entry('succor', 'Succor', 2.5, 30, 0, 'all', 'all', ['sch'], ['사기고양책'], {
        shieldBaseActionKey: 'adloquium',
        shieldPotency: 320,
    }),
    entry('concitation', 'Concitation', 2.5, 30, 0, 'all', 'all', ['sch'], ['의기왕성책'], {
        shieldBaseActionKey: 'adloquium',
        shieldPotency: 360,
    }),
    entry('manifestation', 'Manifestation', 2.5, 30, 0, 'all', 'owner', ['sch'], ['현시'], {
        shieldBaseActionKey: 'adloquium',
        shieldPotency: 648,
    }),
    entry('accession', 'Accession', 2.5, 30, 0, 'all', 'all', ['sch'], ['강림'], {
        shieldBaseActionKey: 'adloquium',
        shieldPotency: 432,
    }),
    entry('sacred-soil', 'Sacred Soil', 30, 15, 10, 'all', 'all', ['sch'], ['야전치유진']),
    entry('expedient', 'Expedient', 120, 20, 10, 'all', 'all', ['sch'], ['질풍노도계']),
    entry('collective-unconscious', 'Collective Unconscious', 60, 18, 10, 'all', 'all', ['ast'], [
        '운명의 수레바퀴',
    ]),
    entry('exaltation', 'Exaltation', 60, 8, 10, 'all', 'owner', ['ast'], ['별점']),
    entry('sun-sign', 'Sun Sign', 120, 15, 10, 'all', 'all', ['ast'], ['태양별자리']),
    entry('kerachole', 'Kerachole', 30, 15, 10, 'all', 'all', ['sge'], ['케라콜레']),
    entry('taurochole', 'Taurochole', 45, 15, 10, 'all', 'owner', ['sge'], ['타우로콜레']),
    entry('holos', 'Holos', 120, 20, 10, 'all', 'all', ['sge'], ['홀로스']),
    entry('haima', 'Haima', 120, 15, 15, 'all', 'owner', ['sge'], ['하이마']),
    entry('panhaima', 'Panhaima', 120, 15, 15, 'all', 'all', ['sge'], ['판하이마']),
    entry('addle', 'Addle', 90, 15, 10, 'magical', 'all', ['blm', 'smn', 'rdm', 'pct'], [
        '정신 교란',
        '정신교란',
    ]),
    entry('feint', 'Feint', 90, 15, 10, 'physical', 'all', ['mnk', 'drg', 'nin', 'sam', 'rpr', 'vpr'], ['견제']),
    entry('troubadour', 'Troubadour', 90, 15, 10, 'all', 'all', ['brd'], ['방랑하는 음악가']),
    entry('tactician', 'Tactician', 90, 15, 10, 'all', 'all', ['mch'], ['책략가']),
    entry('shield-samba', 'Shield Samba', 90, 15, 10, 'all', 'all', ['dnc'], ['방패 삼바', '방패삼바']),
    entry('magick-barrier', 'Magick Barrier', 120, 10, 10, 'magical', 'all', ['rdm'], ['바매직', '마법 방벽']),
    entry('tempera-grassa', 'Tempera Grassa', 120, 10, 10, 'all', 'all', ['pct'], ['템페라 그라사']),
];

function entry(id, name, cooldown, duration, reduction, damageType, targetGroup, jobs, aliases = [], metadata = {}) {
    return {
        aliases,
        cooldown,
        damageType,
        duration,
        id,
        jobs,
        name,
        reduction,
        shieldBaseActionKey: metadata.shieldBaseActionKey || '',
        shieldPotency: metadata.shieldPotency || 0,
        targetGroup,
    };
}

function normalizeActionName(name) {
    return String(name || '').trim();
}

function actionKey(name) {
    return normalizeActionName(name).toLowerCase().replace(/\s+/g, ' ');
}

function normalizeActionCatalog(catalog) {
    const source = Array.isArray(catalog) ? catalog : DEFAULT_ACTION_CATALOG;
    return source.map((candidate, index) => normalizeCatalogEntry(candidate, index));
}

function normalizeCatalogEntry(candidate, index) {
    const fallback = DEFAULT_ACTION_CATALOG[index] || DEFAULT_ACTION_CATALOG[0];
    const name = normalizeActionName(candidate.name || fallback.name);
    const jobs = normalizeJobs(candidate.jobs).length ? normalizeJobs(candidate.jobs) : normalizeJobs(fallback.jobs);

    return {
        id: String(candidate.id || actionKey(name) || `action-${index + 1}`),
        name,
        cooldown: clampNumber(candidate.cooldown, fallback.cooldown, 0, 9999),
        duration: clampNumber(candidate.duration, fallback.duration, 0, 9999),
        reduction: clampNumber(candidate.reduction, fallback.reduction, 0, 100),
        shieldBaseActionKey: String(candidate.shieldBaseActionKey || fallback.shieldBaseActionKey || ''),
        shieldPotency: clampNumber(candidate.shieldPotency, fallback.shieldPotency || 0, 0, 99999),
        damageType: DAMAGE_TYPES.includes(candidate.damageType) ? candidate.damageType : fallback.damageType,
        targetGroup: TARGET_GROUPS.includes(candidate.targetGroup) ? candidate.targetGroup : fallback.targetGroup,
        jobs,
        aliases: Array.isArray(candidate.aliases) ? candidate.aliases.map(String).filter(Boolean) : [],
    };
}

function normalizeJobs(jobs) {
    if (!Array.isArray(jobs)) {
        return [];
    }

    return [...new Set(jobs.map(normalizeJob).filter(Boolean))];
}

function resolveAction(name, catalog = DEFAULT_ACTION_CATALOG) {
    const normalized = normalizeActionName(name);
    const key = actionKey(normalized);
    const found = normalizeActionCatalog(catalog).find((candidate) => {
        if (actionKey(candidate.name) === key) {
            return true;
        }
        return candidate.aliases.some((alias) => actionKey(alias) === key);
    });

    if (!found) {
        return {
            aliases: [],
            cooldown: 0,
            key,
            name: normalized,
        };
    }

    return {
        aliases: found.aliases,
        cooldown: found.cooldown,
        key: actionKey(found.name),
        name: found.name,
    };
}

function getActionPresetsForRole(role, catalog = DEFAULT_ACTION_CATALOG) {
    return normalizeActionCatalog(catalog)
        .filter((candidate) => candidate.jobs.some((job) => getJobRole(job) === role))
        .map(toPreset);
}

function getActionPresetsForMember(role, job, catalog = DEFAULT_ACTION_CATALOG) {
    const normalizedJob = normalizeJob(job);
    const resolvedRole = getJobRole(normalizedJob) || role;

    return normalizeActionCatalog(catalog)
        .filter((candidate) => {
            if (normalizedJob) {
                return candidate.jobs.includes(normalizedJob);
            }
            return candidate.jobs.some((candidateJob) => getJobRole(candidateJob) === resolvedRole);
        })
        .map(toPreset);
}

function toPreset(candidate) {
    return {
        cooldown: candidate.cooldown,
        damageType: candidate.damageType,
        duration: candidate.duration,
        id: candidate.id,
        name: candidate.name,
        reduction: candidate.reduction,
        shieldBaseActionKey: candidate.shieldBaseActionKey,
        shieldPotency: candidate.shieldPotency,
        targetGroup: candidate.targetGroup,
    };
}

function getJobRole(job) {
    return JOBS.find((candidate) => candidate.id === normalizeJob(job))?.role || '';
}

function normalizeJob(job) {
    const value = String(job || '').trim().toLowerCase();
    return JOBS.some((candidate) => candidate.id === value) ? value : '';
}

function clampNumber(value, fallback, min, max) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
}

module.exports = {
    ACTION_PRESETS: DEFAULT_ACTION_CATALOG,
    DEFAULT_ACTION_CATALOG,
    JOBS,
    actionKey,
    getActionPresetsForMember,
    getActionPresetsForRole,
    getJobRole,
    normalizeActionCatalog,
    normalizeJob,
    normalizeActionName,
    resolveAction,
};
