// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const DAMAGE_TYPES = ['magical', 'physical', 'darkness'];
const MITIGATION_TYPES = ['all', ...DAMAGE_TYPES];
const TARGET_GROUPS = ['all', 'tanks', 'healers', 'dps'];
const MITIGATION_TARGET_GROUPS = ['all', 'owner', 'tanks', 'healers', 'dps'];
const JOB_GROUPS = [
    {
        label: 'Tank',
        jobs: [
            ['pld', 'PLD'],
            ['war', 'WAR'],
            ['drk', 'DRK'],
            ['gnb', 'GNB'],
        ],
    },
    {
        label: 'Healer',
        jobs: [
            ['whm', 'WHM'],
            ['sch', 'SCH'],
            ['ast', 'AST'],
            ['sge', 'SGE'],
        ],
    },
    {
        label: 'DPS',
        jobs: [
            ['mnk', 'MNK'],
            ['drg', 'DRG'],
            ['nin', 'NIN'],
            ['sam', 'SAM'],
            ['rpr', 'RPR'],
            ['vpr', 'VPR'],
            ['brd', 'BRD'],
            ['mch', 'MCH'],
            ['dnc', 'DNC'],
            ['blm', 'BLM'],
            ['smn', 'SMN'],
            ['rdm', 'RDM'],
            ['pct', 'PCT'],
        ],
    },
];
const JOB_ROLES = Object.fromEntries(JOB_GROUPS.flatMap((group) => group.jobs.map(([job]) => [job, group.label.toLowerCase()])));

const state = {
    actionCatalog: [],
    party: [],
    mechanics: [],
    mitigations: [],
};
let results = [];
let socket = null;
let firebasePlanRef = null;
let syncMode = 'websocket';
let clientId = '';
let reconnectTimer = 0;
let inputTimer = 0;
let remoteSaveTimer = 0;
let draggedMitigationId = '';
let pointerMitigationId = '';
const iconCache = new Map();
const pendingIconRequests = new Set();
let cooldowns = {};
let defaultPlannerState = null;

const contextMenu = document.createElement('div');
contextMenu.className = 'context-menu';
contextMenu.hidden = true;
document.body.append(contextMenu);

const elements = {
    connectionDot: document.querySelector('#connectionDot'),
    connectionLabel: document.querySelector('#connectionLabel'),
    onlineCount: document.querySelector('#onlineCount'),
    partyGrid: document.querySelector('#partyGrid'),
    mechanicsBody: document.querySelector('#mechanicsBody'),
    mitigationsBody: document.querySelector('#mitigationsBody'),
    actionsBody: document.querySelector('#actionsBody'),
    resultsBody: document.querySelector('#resultsBody'),
    timeline: document.querySelector('#timeline'),
    timelineRange: document.querySelector('#timelineRange'),
    addMechanicButton: document.querySelector('#addMechanicButton'),
    quickAddMechanicButton: document.querySelector('#quickAddMechanicButton'),
    savePlanButton: document.querySelector('#savePlanButton'),
    loadPlanButton: document.querySelector('#loadPlanButton'),
    loadPlanInput: document.querySelector('#loadPlanInput'),
    addMitigationButton: document.querySelector('#addMitigationButton'),
    openActionEditorButton: document.querySelector('#openActionEditorButton'),
    addActionButton: document.querySelector('#addActionButton'),
    closeActionEditorButton: document.querySelector('#closeActionEditorButton'),
    actionEditorView: document.querySelector('#actionEditorView'),
    resetButton: document.querySelector('#resetButton'),
};

const dragPreview = document.createElement('div');
dragPreview.className = 'drag-preview';
dragPreview.hidden = true;
document.body.append(dragPreview);

startSync();
bindEvents();

async function startSync() {
    if (hasFirebaseConfig()) {
        await connectFirebase();
        return;
    }

    connect();
}

function hasFirebaseConfig() {
    const config = window.FIREBASE_CONFIG;
    return Boolean(
        window.firebase &&
            config &&
            typeof config === 'object' &&
            config.apiKey &&
            config.databaseURL &&
            config.projectId,
    );
}

async function connectFirebase() {
    syncMode = 'firebase';
    clientId = clientId || createId('client');
    setConnection(false, 'Firebase 연결 중');

    const initialState = await loadDefaultState();
    applyRemoteState(initialState);
    render();

    const app = window.firebase.apps.length ? window.firebase.app() : window.firebase.initializeApp(window.FIREBASE_CONFIG);
    const database = window.firebase.database(app);
    const planId = getPlanId();
    firebasePlanRef = database.ref(`plans/${planId}`);

    firebasePlanRef.on(
        'value',
        (snapshot) => {
            const payload = snapshot.val();
            if (!payload?.state) {
                firebasePlanRef.set(buildRemotePayload(state));
                return;
            }

            applyRemoteState(payload.state);
            setConnection(true, `Firebase: ${planId}`);
            elements.onlineCount.textContent = '공유 plan';
            render();
            requestMissingIcons();
        },
        (error) => {
            setConnection(false, `Firebase 오류: ${error.message}`);
        },
    );
}

function getPlanId() {
    const urlPlanId = new URLSearchParams(location.search).get('plan');
    return sanitizePlanId(urlPlanId || window.FIREBASE_PLAN_ID || 'default');
}

function sanitizePlanId(planId) {
    return (
        String(planId || 'default')
            .trim()
            .replace(/[.#$\[\]/]/g, '-')
            .slice(0, 80) || 'default'
    );
}

async function loadDefaultState() {
    if (defaultPlannerState) {
        return structuredClone(defaultPlannerState);
    }

    const response = await fetch('default-state.json');
    const payload = await response.json();
    defaultPlannerState = payload.state || payload;
    return structuredClone(defaultPlannerState);
}

function buildRemotePayload(nextState) {
    return {
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: clientId,
        state: nextState,
    };
}

function applyRemoteState(nextState) {
    state.actionCatalog = nextState.actionCatalog || state.actionCatalog || [];
    state.party = nextState.party || state.party || [];
    state.mechanics = nextState.mechanics || [];
    state.mitigations = nextState.mitigations || [];
    refreshClientResults();
}

function connect() {
    syncMode = 'websocket';
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${location.host}`);
    setConnection(false, '연결 중');

    socket.addEventListener('open', () => setConnection(true, '연결됨'));
    socket.addEventListener('message', (event) => handleSocketMessage(event.data));
    socket.addEventListener('close', () => {
        setConnection(false, '재연결 중');
        window.clearTimeout(reconnectTimer);
        reconnectTimer = window.setTimeout(connect, 1000);
    });
}

function handleSocketMessage(raw) {
    const message = JSON.parse(raw);
    if (message.clientId) {
        clientId = message.clientId;
    }
    if (message.state) {
        state.actionCatalog = message.state.actionCatalog || [];
        state.party = message.state.party;
        state.mechanics = message.state.mechanics;
        state.mitigations = message.state.mitigations;
    }
    if (message.results) {
        results = message.results;
    }
    if (message.cooldowns) {
        cooldowns = message.cooldowns;
    }
    if (typeof message.online === 'number') {
        elements.onlineCount.textContent = `${message.online}명 접속`;
    }
    render();
    requestMissingIcons();
}

function bindEvents() {
    elements.addMechanicButton.addEventListener('click', addMechanic);
    elements.quickAddMechanicButton?.addEventListener('click', addMechanic);
    elements.savePlanButton?.addEventListener('click', exportPlanToFile);
    elements.loadPlanButton?.addEventListener('click', () => elements.loadPlanInput?.click());
    elements.loadPlanInput?.addEventListener('change', importPlanFile);
    elements.addMitigationButton?.addEventListener('click', addMitigation);
    elements.openActionEditorButton?.addEventListener('click', openActionEditor);
    elements.addActionButton?.addEventListener('click', addAction);
    elements.closeActionEditorButton?.addEventListener('click', closeActionEditor);
    elements.resetButton.addEventListener('click', async () => {
        if (syncMode === 'firebase' && firebasePlanRef) {
            applyRemoteState(await loadDefaultState());
            firebasePlanRef.set(buildRemotePayload(state));
            render();
            return;
        }

        socket?.send(JSON.stringify({ type: 'reset' }));
    });

    document.addEventListener('click', () => hideContextMenu());
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            hideContextMenu();
            closeActionEditor();
        }
    });

    document.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        commitFieldChange(target, false);
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement)) {
            return;
        }

        commitFieldChange(target, true);
    });

    document.addEventListener('click', (event) => {
        const button = event.target.closest('[data-delete]');
        if (!button) {
            return;
        }

        const collection = button.dataset.collection;
        const id = button.dataset.id;
        state[collection] = state[collection].filter((item) => item.id !== id);
        sendUpdate();
    });

    document.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement) || target.dataset.collection !== 'actionCatalog' || target.dataset.field !== 'jobs') {
            return;
        }

        const item = state.actionCatalog.find((candidate) => candidate.id === target.dataset.id);
        if (!item) {
            return;
        }

        const job = target.dataset.job;
        const jobs = new Set(item.jobs || []);
        if (target.checked) {
            jobs.add(job);
        } else {
            jobs.delete(job);
        }
        item.jobs = [...jobs];
        sendUpdate();
    });

    document.addEventListener('dragstart', (event) => {
        const handle = event.target.closest('[data-drag-mitigation]');
        if (!handle) {
            return;
        }

        draggedMitigationId = handle.dataset.id;
        event.dataTransfer.setData('text/plain', draggedMitigationId);
        event.dataTransfer.effectAllowed = 'move';
        document.body.classList.add('dragging-mitigation');
    });

    document.addEventListener('dragend', () => {
        draggedMitigationId = '';
        document.body.classList.remove('dragging-mitigation');
    });

    document.addEventListener('dragover', (event) => {
        const canvas = event.target.closest('.timeline-canvas');
        if (!canvas) {
            return;
        }

        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const mitigationId = event.dataTransfer.getData('text/plain') || draggedMitigationId;
        showDragPreview(mitigationId, event.clientX, event.clientY, canvas);
    });

    document.addEventListener('drop', (event) => {
        const canvas = event.target.closest('.timeline-canvas');
        if (!canvas) {
            return;
        }

        event.preventDefault();
        const mitigationId = event.dataTransfer.getData('text/plain') || draggedMitigationId;
        placeMitigationAtClientX(mitigationId, event.clientX, canvas, event.clientY);
        hideDragPreview();
    });

    document.addEventListener('contextmenu', (event) => {
        const canvas = event.target.closest('.timeline-canvas');
        if (!canvas) {
            return;
        }

        if (isTimelineTimeArea(event.clientY, canvas)) {
            event.preventDefault();
            showMechanicContextMenu(event.clientX, event.clientY, canvas);
            return;
        }

        const ownerId = getOwnerIdAtClientY(event.clientY, canvas);
        if (!ownerId) {
            return;
        }

        event.preventDefault();
        showContextMenu(event.clientX, event.clientY, canvas, ownerId);
    });

    document.addEventListener('pointerdown', (event) => {
        const handle = event.target.closest('[data-drag-mitigation]');
        if (!handle) {
            return;
        }

        pointerMitigationId = handle.dataset.id;
        document.body.classList.add('dragging-mitigation');
        event.preventDefault();
    });

    document.addEventListener('pointermove', (event) => {
        if (!pointerMitigationId) {
            return;
        }

        const hoverTarget = document.elementFromPoint(event.clientX, event.clientY);
        const canvas = hoverTarget?.closest('.timeline-canvas');
        if (canvas) {
            showDragPreview(pointerMitigationId, event.clientX, event.clientY, canvas);
        } else {
            hideDragPreview();
        }
    });

    document.addEventListener('pointerup', (event) => {
        if (!pointerMitigationId) {
            return;
        }

        const dropTarget = document.elementFromPoint(event.clientX, event.clientY);
        const canvas = dropTarget?.closest('.timeline-canvas');
        if (canvas) {
            placeMitigationAtClientX(pointerMitigationId, event.clientX, canvas, event.clientY);
        }

        pointerMitigationId = '';
        document.body.classList.remove('dragging-mitigation');
        hideDragPreview();
    });
}

function openActionEditor() {
    elements.actionEditorView.hidden = false;
    document.body.classList.add('editor-open');
}

function closeActionEditor() {
    if (!elements.actionEditorView?.hidden) {
        elements.actionEditorView.hidden = true;
        document.body.classList.remove('editor-open');
    }
}

function commitFieldChange(target, immediate) {
        const collection = target.dataset.collection;
        const id = target.dataset.id;
        const field = target.dataset.field;
        if (!collection || !id || !field) {
            return;
        }
        if (collection === 'actionCatalog' && field === 'jobs') {
            return;
        }

        const item = state[collection].find((candidate) => candidate.id === id);
        if (!item) {
            return;
        }

        item[field] = target.type === 'number' ? Number(target.value) : target.value;
        if (collection === 'actionCatalog' && field === 'aliases') {
            item.aliases = target.value
                .split(',')
                .map((alias) => alias.trim())
                .filter(Boolean);
        }
        if (collection === 'party' && field === 'job') {
            item.role = JOB_ROLES[item.job] || item.role;
        }
        if (collection === 'actionCatalog') {
            requestActionIcon(item.name);
        }
        window.clearTimeout(inputTimer);
    if (immediate || target instanceof HTMLSelectElement) {
        sendUpdate();
    } else {
        inputTimer = window.setTimeout(sendUpdate, 300);
    }
}

function addMechanic() {
    const maxTime = Math.max(0, ...state.mechanics.map((mechanic) => Number(mechanic.time) || 0));
    addMechanicAt(maxTime + 15);
}

function addMechanicAt(time) {
    state.mechanics.push({
        id: createId('m'),
        time: roundToTenth(time),
        name: 'New mechanic',
        damage: 100000,
        damageType: 'magical',
        targetGroup: 'all',
    });
    sendUpdate();
}

function addMitigation() {
    state.mitigations.push({
        id: createId('mit'),
        name: 'New mitigation',
        ownerId: state.party[0]?.id || 'mt',
        start: 0,
        duration: 15,
        cooldown: 0,
        reduction: 10,
        damageType: 'all',
        targetGroup: 'all',
    });
    sendUpdate();
}

function addAction() {
    state.actionCatalog.push({
        id: createId('action'),
        name: 'Custom Mitigation',
        jobs: ['gnb'],
        cooldown: 90,
        duration: 15,
        reduction: 10,
        damageType: 'all',
        targetGroup: 'all',
        aliases: [],
    });
    sendUpdate();
}

function exportPlanToFile() {
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        state,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mitigation-plan-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(link.href);
}

async function importPlanFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
        return;
    }

    try {
        const payload = JSON.parse(await file.text());
        const importedState = payload.state || payload;
        state.actionCatalog = importedState.actionCatalog || state.actionCatalog;
        state.party = importedState.party || state.party;
        state.mechanics = importedState.mechanics || [];
        state.mitigations = importedState.mitigations || [];
        sendUpdate();
    } catch (error) {
        window.alert(`불러오기에 실패했습니다: ${error.message}`);
    }
}

async function showContextMenu(clientX, clientY, canvas, ownerId) {
    const member = state.party.find((candidate) => candidate.id === ownerId);
    if (!member) {
        return;
    }

    const start = getMitigationStartAtClientX({ duration: 0 }, clientX, canvas);
    const presets = getMemberPresets(member);
    if (!presets.length) {
        return;
    }

    contextMenu.innerHTML = `
        <div class="context-title">${escapeHtml(member.name)} ${escapeHtml(jobLabel(member.job))} ${formatSeconds(start)}s</div>
        ${presets
            .map(
                (preset) => `
                    <button type="button" data-preset="${escapeHtml(preset.name)}">
                        ${iconMarkup(preset.name)}
                        <span>${escapeHtml(preset.name)}</span>
                    </button>
                `,
            )
            .join('')}
    `;

    contextMenu.hidden = false;
    contextMenu.style.left = `${clientX}px`;
    contextMenu.style.top = `${clientY}px`;

    contextMenu.querySelectorAll('[data-preset]').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const preset = presets.find((candidate) => candidate.name === button.dataset.preset);
            if (preset) {
                addMitigationFromPreset(ownerId, start, preset);
            }
            hideContextMenu();
        });
    });
}

function hideContextMenu() {
    contextMenu.hidden = true;
}

function showMechanicContextMenu(clientX, clientY, canvas) {
    const time = getTimelineSecondsAtClientX(clientX, canvas);

    contextMenu.innerHTML = `
        <div class="context-title">${formatSeconds(time)}s</div>
        <button type="button" data-add-mechanic-at="${formatSeconds(time)}">
            <span class="skill-icon placeholder"></span>
            <span>기믹 추가</span>
        </button>
    `;

    contextMenu.hidden = false;
    contextMenu.style.left = `${clientX}px`;
    contextMenu.style.top = `${clientY}px`;

    contextMenu.querySelector('[data-add-mechanic-at]')?.addEventListener('click', (event) => {
        event.stopPropagation();
        addMechanicAt(time);
        hideContextMenu();
    });
}

function getMemberPresets(member) {
    return state.actionCatalog
        .filter((action) => (action.jobs || []).includes(member.job))
        .map((action) => ({
            cooldown: Number(action.cooldown) || 0,
            damageType: action.damageType || 'all',
            duration: Number(action.duration) || 0,
            name: action.name,
            reduction: Number(action.reduction) || 0,
            targetGroup: action.targetGroup || 'all',
        }));
}

function addMitigationFromPreset(ownerId, start, preset) {
    state.mitigations.push({
        id: createId('mit'),
        ownerId,
        name: preset.name,
        start,
        duration: preset.duration,
        cooldown: preset.cooldown,
        reduction: preset.reduction,
        damageType: preset.damageType,
        targetGroup: preset.targetGroup,
    });
    sendUpdate();
}

function placeMitigationAtClientX(mitigationId, clientX, canvas, clientY) {
    const mitigation = state.mitigations.find((candidate) => candidate.id === mitigationId);
    if (!mitigation) {
        return;
    }

    const start = getMitigationStartAtClientX(mitigation, clientX, canvas);
    const ownerId = getOwnerIdAtClientY(clientY, canvas) || mitigation.ownerId;
    const placement = getCooldownPlacementStatus(mitigationId, start, ownerId);
    if (!placement.available) {
        showDragPreview(mitigationId, clientX, clientY, canvas, placement);
        return;
    }

    mitigation.start = start;
    mitigation.ownerId = ownerId;
    sendUpdate();
}

function getMitigationStartAtClientX(mitigation, clientX, canvas) {
    const range = Number(canvas.dataset.range) || 90;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));
    const rawStart = (x / rect.width) * range;
    const maxStart = Math.max(0, range - Number(mitigation.duration || 0));

    return roundToTenth(Math.min(maxStart, Math.max(0, rawStart)));
}

function getTimelineSecondsAtClientX(clientX, canvas) {
    const range = Number(canvas.dataset.range) || 90;
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));

    return roundToTenth((x / rect.width) * range);
}

function isTimelineTimeArea(clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const rowTop = Number(canvas.dataset.rowTop) || 56;

    return y >= 0 && y < rowTop;
}

function getOwnerIdAtClientY(clientY, canvas) {
    const rect = canvas.getBoundingClientRect();
    const y = clientY - rect.top;
    const rowTop = Number(canvas.dataset.rowTop) || 56;
    const rowHeight = Number(canvas.dataset.rowHeight) || 34;
    const index = Math.floor((y - rowTop) / rowHeight);

    if (index < 0 || index >= state.party.length) {
        return '';
    }
    return state.party[index].id;
}

function showDragPreview(mitigationId, clientX, clientY, canvas, placementOverride) {
    const mitigation = state.mitigations.find((candidate) => candidate.id === mitigationId);
    if (!mitigation) {
        hideDragPreview();
        return;
    }

    const seconds = getMitigationStartAtClientX(mitigation, clientX, canvas);
    const ownerId = getOwnerIdAtClientY(clientY, canvas) || mitigation.ownerId;
    const placement = placementOverride || getCooldownPlacementStatus(mitigationId, seconds, ownerId);
    const rect = canvas.getBoundingClientRect();
    const x = Math.min(rect.width, Math.max(0, clientX - rect.left));

    dragPreview.hidden = false;
    dragPreview.classList.toggle('invalid', !placement.available);
    dragPreview.dataset.label = placement.available
        ? `${formatSeconds(seconds)}s`
        : `${formatSeconds(seconds)}s / CD ${formatSeconds(placement.availableAt)}s`;
    dragPreview.style.left = `${rect.left + x}px`;
    dragPreview.style.top = `${rect.top}px`;
    dragPreview.style.height = `${rect.height}px`;
}

function hideDragPreview() {
    dragPreview.hidden = true;
    dragPreview.classList.remove('invalid');
}

function roundToTenth(value) {
    return Math.round(Number(value) * 10) / 10;
}

function getCooldownPlacementStatus(mitigationId, nextStart, nextOwnerId) {
    const candidates = state.mitigations
        .map((mitigation) => ({
            ...mitigation,
            start: mitigation.id === mitigationId ? nextStart : mitigation.start,
            ownerId: mitigation.id === mitigationId ? nextOwnerId || mitigation.ownerId : mitigation.ownerId,
        }))
        .sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id)));
    const availableAtByAction = new Map();

    for (const mitigation of candidates) {
        const key = `${mitigation.ownerId || 'unknown'}:${mitigation.actionKey || normalizeActionName(mitigation.actionName || mitigation.name).toLowerCase()}`;
        const cooldown = Number(mitigation.cooldown || 0);
        const start = Number(mitigation.start || 0);
        const availableAt = availableAtByAction.get(key) || 0;
        const available = cooldown <= 0 || start >= availableAt;

        if (mitigation.id === mitigationId) {
            return { available, availableAt };
        }

        if (available && cooldown > 0) {
            availableAtByAction.set(key, roundToTenth(start + cooldown));
        }
    }

    return { available: true, availableAt: 0 };
}

function refreshClientResults() {
    cooldowns = calculateCooldownConflictsClient(state.mitigations);
    results = calculatePlannerResultsClient(state);
}

function calculatePlannerResultsClient(plannerState) {
    return (plannerState.mechanics || [])
        .slice()
        .sort((a, b) => Number(a.time) - Number(b.time))
        .map((mechanic) => calculateMechanicResultClient(mechanic, plannerState.party || [], plannerState.mitigations || []));
}

function calculateMechanicResultClient(mechanic, party, mitigations) {
    const members = {};
    let survives = true;
    let lowestRemainingHp = Infinity;
    const activeNames = new Map();
    const effectiveDamageByMember = {};
    const cooldownStatuses = calculateCooldownConflictsMapClient(mitigations);

    for (const member of party) {
        if (!groupIncludesMemberClient(mechanic.targetGroup, member)) {
            members[member.id] = {
                activeMitigationNames: [],
                effectiveDamage: 0,
                remainingHp: Number(member.maxHp) || 0,
                targeted: false,
            };
            continue;
        }

        const activeMitigations = mitigations.filter((mitigation) => {
            const start = Number(mitigation.start) || 0;
            const end = start + (Number(mitigation.duration) || 0);
            const cooldownStatus = cooldownStatuses.get(mitigation.id);
            return (
                cooldownStatus?.available !== false &&
                start <= Number(mechanic.time) &&
                Number(mechanic.time) <= end &&
                mitigationMatchesDamageTypeClient(mitigation, mechanic) &&
                groupIncludesMemberClient(mitigation.targetGroup, member, mitigation.ownerId)
            );
        });
        const multiplier = activeMitigations.reduce((value, mitigation) => value * (1 - Number(mitigation.reduction || 0) / 100), 1);
        const effectiveDamage = Math.round((Number(mechanic.damage) || 0) * multiplier);
        const remainingHp = (Number(member.maxHp) || 0) - effectiveDamage;

        effectiveDamageByMember[member.id] = effectiveDamage;
        if (remainingHp <= 0) {
            survives = false;
        }
        lowestRemainingHp = Math.min(lowestRemainingHp, remainingHp);

        for (const mitigation of activeMitigations) {
            activeNames.set(mitigation.id, mitigation.name);
        }

        members[member.id] = {
            activeMitigationNames: activeMitigations.map((mitigation) => mitigation.name),
            effectiveDamage,
            remainingHp,
            targeted: true,
        };
    }

    return {
        activeMitigationNames: [...activeNames.values()],
        effectiveDamageByMember,
        lowestRemainingHp: Number.isFinite(lowestRemainingHp) ? lowestRemainingHp : 0,
        mechanic,
        members,
        survives,
    };
}

function calculateCooldownConflictsClient(mitigations) {
    return Object.fromEntries(calculateCooldownConflictsMapClient(mitigations));
}

function calculateCooldownConflictsMapClient(mitigations) {
    const statuses = new Map();
    const availableAtByOwnerAction = new Map();
    const sorted = (mitigations || [])
        .slice()
        .sort((a, b) => Number(a.start) - Number(b.start) || String(a.id).localeCompare(String(b.id)));

    for (const mitigation of sorted) {
        const ownerId = mitigation.ownerId || 'unknown';
        const actionKey = mitigation.actionKey || normalizeActionName(mitigation.actionName || mitigation.name).toLowerCase();
        const ownerActionKey = `${ownerId}:${actionKey}`;
        const cooldown = Number(mitigation.cooldown || 0);
        const start = Number(mitigation.start || 0);
        const availableAt = availableAtByOwnerAction.get(ownerActionKey) || 0;
        const available = cooldown <= 0 || start >= availableAt;

        statuses.set(mitigation.id, {
            actionKey,
            available,
            availableAt: roundToTenth(availableAt),
            cooldown,
            ownerId,
        });

        if (available && cooldown > 0) {
            availableAtByOwnerAction.set(ownerActionKey, roundToTenth(start + cooldown));
        }
    }

    return statuses;
}

function mitigationMatchesDamageTypeClient(mitigation, mechanic) {
    return mitigation.damageType === 'all' || mitigation.damageType === mechanic.damageType;
}

function groupIncludesMemberClient(group, member, ownerId = '') {
    if (group === 'all') return true;
    if (group === 'owner') return member.id === ownerId;
    if (group === 'tanks') return member.role === 'tank';
    if (group === 'healers') return member.role === 'healer';
    if (group === 'dps') return member.role === 'dps';
    return false;
}

function sendUpdate() {
    if (syncMode === 'firebase' && firebasePlanRef) {
        refreshClientResults();
        render();
        window.clearTimeout(remoteSaveTimer);
        remoteSaveTimer = window.setTimeout(() => {
            firebasePlanRef.set(buildRemotePayload(state));
        }, 120);
        return;
    }

    if (socket?.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'update', clientId, state }));
    }
    render();
}

function render() {
    renderParty();
    renderMechanics();
    renderMitigations();
    renderActions();
    renderTimeline();
    renderResults();
    requestMissingIcons();
}

function requestMissingIcons() {
    for (const mitigation of state.mitigations) {
        const name = normalizeActionName(mitigation.name);
        if (!name || iconCache.has(name.toLowerCase()) || pendingIconRequests.has(name.toLowerCase())) {
            continue;
        }

        requestActionIcon(name);
    }
    for (const action of state.actionCatalog) {
        const name = normalizeActionName(action.name);
        if (!name || iconCache.has(name.toLowerCase()) || pendingIconRequests.has(name.toLowerCase())) {
            continue;
        }

        requestActionIcon(name);
    }
}

async function requestActionIcon(name) {
    const cacheKey = name.toLowerCase();
    pendingIconRequests.add(cacheKey);

    try {
        const response = await fetch(`api/action-icon?name=${encodeURIComponent(name)}`);
        if (!response.ok) {
            throw new Error(`local icon lookup failed: ${response.status}`);
        }
        const payload = await response.json();
        iconCache.set(cacheKey, payload.iconUrl || '');
    } catch {
        iconCache.set(cacheKey, await requestXivapiIcon(name));
    } finally {
        pendingIconRequests.delete(cacheKey);
        render();
    }
}

async function requestXivapiIcon(name) {
    try {
        const searchUrl = new URL('https://v2.xivapi.com/api/search');
        searchUrl.searchParams.set('sheets', 'Action');
        searchUrl.searchParams.set('fields', 'Name,Icon');
        searchUrl.searchParams.set('query', `Name=${JSON.stringify(name)}`);
        searchUrl.searchParams.set('language', 'en');
        searchUrl.searchParams.set('limit', '8');

        const response = await fetch(searchUrl);
        if (!response.ok) {
            return '';
        }
        const payload = await response.json();
        const result = (payload.results || []).find((candidate) => candidate?.fields?.Icon) || null;
        const path = result?.fields?.Icon?.path_hr1 || result?.fields?.Icon?.path;
        if (!path) {
            return '';
        }

        const assetUrl = new URL('https://v2.xivapi.com/api/asset');
        assetUrl.searchParams.set('path', path);
        assetUrl.searchParams.set('format', 'png');
        return assetUrl.toString();
    } catch {
        return '';
    }
}

function renderParty() {
    elements.partyGrid.innerHTML = state.party
        .map(
            (member) => `
                <div class="party-row">
                    <span class="slot-name">${escapeHtml(member.name)}</span>
                    ${jobSelect(member)}
                    <input type="number" min="1" value="${member.maxHp}" data-collection="party" data-id="${member.id}" data-field="maxHp" />
                </div>
            `,
        )
        .join('');
}

function renderMechanics() {
    elements.mechanicsBody.innerHTML = state.mechanics
        .slice()
        .sort((a, b) => a.time - b.time)
        .map(
            (mechanic) => `
                <tr>
                    <td><input class="time-input" type="number" min="0" step="0.1" value="${formatSeconds(mechanic.time)}" data-collection="mechanics" data-id="${mechanic.id}" data-field="time" /></td>
                    <td><input value="${escapeHtml(mechanic.name)}" data-collection="mechanics" data-id="${mechanic.id}" data-field="name" /></td>
                    <td><input class="damage-input" type="number" min="0" value="${mechanic.damage}" data-collection="mechanics" data-id="${mechanic.id}" data-field="damage" /></td>
                    <td>${select('mechanics', mechanic.id, 'damageType', DAMAGE_TYPES, mechanic.damageType)}</td>
                    <td>${select('mechanics', mechanic.id, 'targetGroup', TARGET_GROUPS, mechanic.targetGroup)}</td>
                    <td><button class="delete-button" type="button" data-delete="true" data-collection="mechanics" data-id="${mechanic.id}">×</button></td>
                </tr>
            `,
        )
        .join('');
}

function renderMitigations() {
    elements.mitigationsBody.innerHTML = state.mitigations
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((mitigation) => {
            const cooldownStatus = cooldowns[mitigation.id];
            const locked = cooldownStatus?.available === false;

            return `
                <tr class="${locked ? 'cooldown-locked-row' : ''}">
                    <td><button class="drag-handle" type="button" draggable="true" data-drag-mitigation="true" data-id="${mitigation.id}" title="타임라인에 끌어놓기">move</button></td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.start)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="start" /></td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.duration)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="duration" /></td>
                    <td>${partySelect(mitigation.id, mitigation.ownerId)}</td>
                    <td>
                        <div class="skill-cell">
                            ${iconMarkup(mitigation.name)}
                            <input value="${escapeHtml(mitigation.name)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="name" />
                        </div>
                        ${locked ? `<div class="cooldown-note">CD ${formatSeconds(cooldownStatus.availableAt)}s부터 가능</div>` : ''}
                    </td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.cooldown || 0)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="cooldown" /></td>
                    <td><input class="small-input" type="number" min="0" max="100" value="${mitigation.reduction}" data-collection="mitigations" data-id="${mitigation.id}" data-field="reduction" /></td>
                    <td>${select('mitigations', mitigation.id, 'damageType', MITIGATION_TYPES, mitigation.damageType)}</td>
                    <td>${select('mitigations', mitigation.id, 'targetGroup', MITIGATION_TARGET_GROUPS, mitigation.targetGroup)}</td>
                    <td><button class="delete-button" type="button" data-delete="true" data-collection="mitigations" data-id="${mitigation.id}">×</button></td>
                </tr>
            `;
        })
        .join('');
}

function renderTimeline() {
    const maxMechanic = Math.max(90, ...state.mechanics.map((mechanic) => mechanic.time));
    const maxMitigation = Math.max(90, ...state.mitigations.map((mitigation) => mitigation.start + mitigation.duration));
    const range = Math.ceil(Math.max(maxMechanic, maxMitigation) / 30) * 30;
    const width = Math.max(1100, range * 8);
    const rowTop = 56;
    const rowHeight = 38;
    const height = rowTop + state.party.length * rowHeight;

    elements.timelineRange.textContent = `0s - ${range}s`;

    const scale = [];
    for (let second = 0; second <= range; second += 30) {
            scale.push(`<span class="scale-label" style="left:${(second / range) * width}px">${formatSeconds(second)}s</span>`);
    }

    const resultById = new Map(results.map((result) => [result.mechanic.id, result]));
    const markers = state.mechanics
        .map((mechanic) => {
            const left = (mechanic.time / range) * width;
            const result = resultById.get(mechanic.id);
            const status = result?.survives ? 'survives' : 'fails';
            return `
                <div class="marker ${status}" style="left:${left}px"></div>
                <div class="marker-label" style="left:${left}px">${escapeHtml(mechanic.name)}<br>${formatSeconds(mechanic.time)}s</div>
            `;
        })
        .join('');

    const lanes = state.party
        .map((member, index) => {
            const top = rowTop + index * rowHeight;
            return `
                <div class="timeline-lane" style="top:${top}px;height:${rowHeight}px"></div>
                <div class="lane-label" style="top:${top + 8}px">${escapeHtml(member.name)} <span>${escapeHtml(jobLabel(member.job))}</span></div>
            `;
        })
        .join('');
    const laneDividers = state.party
        .map((_, index) => `<div class="timeline-divider" style="top:${rowTop + index * rowHeight}px"></div>`)
        .join('');

    const bars = state.mitigations
        .map((mitigation) => {
            const left = (mitigation.start / range) * width;
            const barWidth = Math.max(18, (mitigation.duration / range) * width);
            const ownerIndex = Math.max(
                0,
                state.party.findIndex((member) => member.id === mitigation.ownerId),
            );
            const top = rowTop + ownerIndex * rowHeight + 8;
            return `
                <div class="bar" draggable="true" data-drag-mitigation="true" data-id="${mitigation.id}" style="left:${left}px;top:${top}px;width:${barWidth}px" title="${escapeHtml(mitigation.name)} ${formatSeconds(mitigation.start)}s-${formatSeconds(mitigation.start + mitigation.duration)}s">
                    ${iconMarkup(mitigation.name)}<span>${escapeHtml(mitigation.name)} ${mitigation.reduction}%</span>
                </div>
            `;
        })
        .join('');

    elements.timeline.innerHTML = `
        <div class="timeline-canvas" data-range="${range}" data-row-top="${rowTop}" data-row-height="${rowHeight}" style="width:${width}px;--timeline-height:${height}px">
            ${scale.join('')}
            ${lanes}
            ${laneDividers}
            ${markers}
            ${bars}
        </div>
    `;
}

function renderMitigations() {
    elements.mitigationsBody.innerHTML = state.mitigations
        .slice()
        .sort((a, b) => a.start - b.start)
        .map((mitigation) => {
            const cooldownStatus = cooldowns[mitigation.id];
            const locked = cooldownStatus?.available === false;

            return `
                <tr class="${locked ? 'cooldown-locked-row' : ''}">
                    <td><button class="drag-handle" type="button" draggable="true" data-drag-mitigation="true" data-id="${mitigation.id}" title="Drag to timeline">move</button></td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.start)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="start" /></td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.duration)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="duration" /></td>
                    <td>${partySelect(mitigation.id, mitigation.ownerId)}</td>
                    <td>
                        <div class="skill-cell">
                            ${iconMarkup(mitigation.name)}
                            <input value="${escapeHtml(mitigation.name)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="name" />
                        </div>
                        ${locked ? `<div class="cooldown-note">CD ready at ${formatSeconds(cooldownStatus.availableAt)}s</div>` : ''}
                    </td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(mitigation.cooldown || 0)}" data-collection="mitigations" data-id="${mitigation.id}" data-field="cooldown" /></td>
                    <td><input class="small-input" type="number" min="0" max="100" value="${mitigation.reduction}" data-collection="mitigations" data-id="${mitigation.id}" data-field="reduction" /></td>
                    <td>${select('mitigations', mitigation.id, 'damageType', MITIGATION_TYPES, mitigation.damageType)}</td>
                    <td>${select('mitigations', mitigation.id, 'targetGroup', MITIGATION_TARGET_GROUPS, mitigation.targetGroup)}</td>
                    <td><button class="delete-button" type="button" data-delete="true" data-collection="mitigations" data-id="${mitigation.id}">x</button></td>
                </tr>
            `;
        })
        .join('');
}

function renderTimeline() {
    const maxMechanic = Math.max(90, ...state.mechanics.map((mechanic) => mechanic.time));
    const maxMitigation = Math.max(90, ...state.mitigations.map((mitigation) => mitigation.start + mitigation.duration));
    const range = Math.ceil(Math.max(maxMechanic, maxMitigation) / 30) * 30;
    const width = Math.max(1100, range * 8);
    const rowTop = 56;
    const rowHeight = 38;
    const height = rowTop + state.party.length * rowHeight;

    elements.timelineRange.textContent = `0s - ${range}s`;

    const scale = [];
    for (let second = 0; second <= range; second += 30) {
        scale.push(`<span class="scale-label" style="left:${(second / range) * width}px">${formatSeconds(second)}s</span>`);
    }

    const resultById = new Map(results.map((result) => [result.mechanic.id, result]));
    const markers = state.mechanics
        .map((mechanic) => {
            const left = (mechanic.time / range) * width;
            const result = resultById.get(mechanic.id);
            const status = result?.survives ? 'survives' : 'fails';
            return `
                <div class="marker ${status}" style="left:${left}px"></div>
                <div class="marker-label" style="left:${left}px">${escapeHtml(mechanic.name)}<br>${formatSeconds(mechanic.time)}s</div>
            `;
        })
        .join('');

    const lanes = state.party
        .map((member, index) => {
            const top = rowTop + index * rowHeight;
            return `
                <div class="timeline-lane" style="top:${top}px;height:${rowHeight}px"></div>
                <div class="lane-label" style="top:${top + 8}px">${escapeHtml(member.name)} <span>${escapeHtml(jobLabel(member.job))}</span></div>
            `;
        })
        .join('');
    const laneDividers = state.party
        .map((_, index) => `<div class="timeline-divider" style="top:${rowTop + index * rowHeight}px"></div>`)
        .join('');

    const bars = state.mitigations
        .map((mitigation) => {
            const left = (mitigation.start / range) * width;
            const barWidth = Math.max(18, (mitigation.duration / range) * width);
            const ownerIndex = Math.max(
                0,
                state.party.findIndex((member) => member.id === mitigation.ownerId),
            );
            const top = rowTop + ownerIndex * rowHeight + 8;
            const cooldownStatus = cooldowns[mitigation.id];
            const locked = cooldownStatus?.available === false;
            return `
                <div class="bar ${locked ? 'cooldown-locked' : ''}" draggable="true" data-drag-mitigation="true" data-id="${mitigation.id}" style="left:${left}px;top:${top}px;width:${barWidth}px" title="${escapeHtml(mitigation.name)} ${formatSeconds(mitigation.start)}s-${formatSeconds(mitigation.start + mitigation.duration)}s">
                    ${iconMarkup(mitigation.name)}<span>${escapeHtml(mitigation.name)} ${locked ? 'CD' : `${mitigation.reduction}%`}</span>
                </div>
            `;
        })
        .join('');

    elements.timeline.innerHTML = `
        <div class="timeline-canvas" data-range="${range}" data-row-top="${rowTop}" data-row-height="${rowHeight}" style="width:${width}px;--timeline-height:${height}px">
            ${scale.join('')}
            ${lanes}
            ${laneDividers}
            ${markers}
            ${bars}
        </div>
    `;
}

function renderActions() {
    if (!elements.actionsBody) {
        return;
    }

    elements.actionsBody.innerHTML = state.actionCatalog
        .slice()
        .sort((a, b) => String(a.name).localeCompare(String(b.name)))
        .map(
            (action) => `
                <tr>
                    <td>
                        <div class="skill-cell">
                            ${iconMarkup(action.name)}
                            <input value="${escapeHtml(action.name)}" data-collection="actionCatalog" data-id="${action.id}" data-field="name" />
                        </div>
                    </td>
                    <td><input value="${escapeHtml((action.aliases || []).join(', '))}" data-collection="actionCatalog" data-id="${action.id}" data-field="aliases" /></td>
                    <td>${jobCheckboxes(action)}</td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(action.cooldown || 0)}" data-collection="actionCatalog" data-id="${action.id}" data-field="cooldown" /></td>
                    <td><input class="small-input" type="number" min="0" step="0.1" value="${formatSeconds(action.duration || 0)}" data-collection="actionCatalog" data-id="${action.id}" data-field="duration" /></td>
                    <td><input class="small-input" type="number" min="0" max="100" value="${action.reduction}" data-collection="actionCatalog" data-id="${action.id}" data-field="reduction" /></td>
                    <td>${select('actionCatalog', action.id, 'damageType', MITIGATION_TYPES, action.damageType)}</td>
                    <td>${select('actionCatalog', action.id, 'targetGroup', MITIGATION_TARGET_GROUPS, action.targetGroup)}</td>
                    <td><button class="delete-button" type="button" data-delete="true" data-collection="actionCatalog" data-id="${action.id}">x</button></td>
                </tr>
            `,
        )
        .join('');
}

function renderResults() {
    elements.resultsBody.innerHTML = results
        .map((result) => {
            const maxDamage = Math.max(0, ...Object.values(result.effectiveDamageByMember));
            const pills = result.activeMitigationNames.length
                ? `<div class="pill-list">${result.activeMitigationNames.map((name) => `<span class="pill">${iconMarkup(name)}${escapeHtml(name)}</span>`).join('')}</div>`
                : '<span class="empty">없음</span>';
            return `
                <tr>
                    <td>${formatSeconds(result.mechanic.time)}s</td>
                    <td>${escapeHtml(result.mechanic.name)}</td>
                    <td>${pills}</td>
                    <td>${formatNumber(maxDamage)}</td>
                    <td>${formatNumber(result.lowestRemainingHp)}</td>
                    <td><span class="${result.survives ? 'result-ok' : 'result-fail'}">${result.survives ? '생존' : '사망 위험'}</span></td>
                </tr>
            `;
        })
        .join('');
}

function select(collection, id, field, options, value) {
    return `
        <select data-collection="${collection}" data-id="${id}" data-field="${field}">
            ${options.map((option) => `<option value="${option}" ${option === value ? 'selected' : ''}>${label(option)}</option>`).join('')}
        </select>
    `;
}

function partySelect(mitigationId, ownerId) {
    return `
        <select data-collection="mitigations" data-id="${mitigationId}" data-field="ownerId">
            ${state.party
                .map((member) => `<option value="${member.id}" ${member.id === ownerId ? 'selected' : ''}>${escapeHtml(member.name)}</option>`)
                .join('')}
        </select>
    `;
}

function jobSelect(member) {
    return `
        <select class="job-select" data-collection="party" data-id="${member.id}" data-field="job">
            ${JOB_GROUPS.map(
                (group) => `
                    <optgroup label="${group.label}">
                        ${group.jobs
                            .map(
                                ([value, name]) =>
                                    `<option value="${value}" ${value === member.job ? 'selected' : ''}>${name}</option>`,
                            )
                            .join('')}
                    </optgroup>
                `,
            ).join('')}
        </select>
    `;
}

function jobCheckboxes(action) {
    const selected = new Set(action.jobs || []);
    return `
        <div class="jobs-cell">
            ${JOB_GROUPS.flatMap((group) => group.jobs)
                .map(
                    ([value, name]) => `
                        <label class="job-toggle">
                            <input type="checkbox" ${selected.has(value) ? 'checked' : ''} data-collection="actionCatalog" data-id="${action.id}" data-field="jobs" data-job="${value}" />
                            <span>${name}</span>
                        </label>
                    `,
                )
                .join('')}
        </div>
    `;
}

function jobLabel(job) {
    return JOB_GROUPS.flatMap((group) => group.jobs).find(([value]) => value === job)?.[1] || '';
}

function label(value) {
    const labels = {
        all: '전체',
        magical: '마법',
        physical: '물리',
        darkness: '고정/특수',
        tanks: '탱커',
        healers: '힐러',
        dps: 'DPS',
    };
    return labels[value] || value;
}

function label(value) {
    const labels = {
        all: '전체',
        owner: '사용자',
        magical: '마법',
        physical: '물리',
        darkness: '고정/특수',
        tanks: '탱커',
        healers: '힐러',
        dps: 'DPS',
    };
    return labels[value] || value;
}

function iconMarkup(name) {
    const normalized = normalizeActionName(name);
    const iconUrl = iconCache.get(normalized.toLowerCase());
    if (!iconUrl) {
        return '<span class="skill-icon placeholder"></span>';
    }

    return `<img class="skill-icon" src="${escapeHtml(iconUrl)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`;
}

function normalizeActionName(name) {
    return String(name || '').trim();
}

function setConnection(connected, labelText) {
    elements.connectionDot.classList.toggle('connected', connected);
    elements.connectionLabel.textContent = labelText;
}

function createId(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatNumber(value) {
    return Math.round(value).toLocaleString('ko-KR');
}

function formatSeconds(value) {
    const rounded = roundToTenth(value);
    return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}
