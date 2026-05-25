// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const XIVAPI_BASE = 'https://v2.xivapi.com';

const { normalizeActionName, resolveAction } = require('./actions');

function buildActionSearchUrl(name) {
    const normalized = resolveAction(name).name || normalizeActionName(name);
    const url = new URL('/api/search', XIVAPI_BASE);
    url.searchParams.set('sheets', 'Action');
    url.searchParams.set('fields', 'Name,Icon');
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
    return (
        results.find((result) => String(result?.fields?.Name || '').toLowerCase() === normalized && result?.fields?.Icon) ||
        results.find((result) => result?.fields?.Icon) ||
        null
    );
}

module.exports = {
    buildActionSearchUrl,
    findBestIconResult,
    iconAssetUrlFromResult,
    normalizeActionName,
    resolveAction,
};
