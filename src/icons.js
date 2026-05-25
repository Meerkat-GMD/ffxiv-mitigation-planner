// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const XIVAPI_BASE = 'https://v2.xivapi.com';

const { normalizeActionName, resolveAction } = require('./actions');

function buildActionSearchUrl(name) {
    const normalized = resolveAction(name).name || normalizeActionName(name);
    const url = new URL('/api/search', XIVAPI_BASE);
    url.searchParams.set('sheets', 'Action');
    url.searchParams.set('fields', 'Name,Icon,ClassJobCategory,IsPvP');
    url.searchParams.set('query', `Name=${JSON.stringify(normalized)}`);
    url.searchParams.set('language', 'en');
    url.searchParams.set('limit', '8');
    return url.toString();
}

function iconAssetUrlFromResult(result) {
    const icon = result?.fields?.Icon;
    const path = icon?.path_hr1 || icon?.path;
    if (!path) {
        return '';
    }

    const url = new URL('/api/asset', XIVAPI_BASE);
    url.searchParams.set('path', path);
    url.searchParams.set('format', 'png');
    return url.toString();
}

function findBestIconResult(results, actionName) {
    const normalized = normalizeActionName(actionName).toLowerCase();
    const exactMatches = results.filter(
        (result) => String(result?.fields?.Name || '').toLowerCase() === normalized && result?.fields?.Icon,
    );

    return (
        exactMatches.find((result) => result?.fields?.IsPvP !== true && hasAssignedClassJobCategory(result)) ||
        exactMatches.find((result) => result?.fields?.IsPvP !== true) ||
        exactMatches[0] ||
        results.find((result) => result?.fields?.Icon) ||
        null
    );
}

function hasAssignedClassJobCategory(result) {
    return Boolean(String(result?.fields?.ClassJobCategory?.fields?.Name || '').trim());
}

module.exports = {
    buildActionSearchUrl,
    findBestIconResult,
    iconAssetUrlFromResult,
    normalizeActionName,
    resolveAction,
};
