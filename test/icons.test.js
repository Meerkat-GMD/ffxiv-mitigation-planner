// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildActionSearchUrl, iconAssetUrlFromResult, normalizeActionName } = require('../src/icons');

test('normalizes action names before icon lookup', () => {
    assert.equal(normalizeActionName('  Reprisal  '), 'Reprisal');
    assert.equal(normalizeActionName(''), '');
    assert.equal(normalizeActionName(null), '');
});

test('builds an exact XIVAPI Action search URL', () => {
    const url = new URL(buildActionSearchUrl('철벽 방어'));

    assert.equal(url.origin, 'https://v2.xivapi.com');
    assert.equal(url.pathname, '/api/search');
    assert.equal(url.searchParams.get('sheets'), 'Action');
    assert.equal(url.searchParams.get('fields'), 'Name,Icon');
    assert.equal(url.searchParams.get('query'), 'Name="Rampart"');
});

test('uses English XIVAPI action names when Korean aliases are requested', () => {
    const url = buildActionSearchUrl('바매직');

    assert.equal(new URL(url).searchParams.get('query'), 'Name="Magick Barrier"');
});

test('turns an XIVAPI icon field into a hotlinkable PNG asset URL', () => {
    const result = {
        fields: {
            Name: 'Addle',
            Icon: {
                path: 'ui/icon/000000/000861.tex',
                path_hr1: 'ui/icon/000000/000861_hr1.tex',
            },
        },
    };

    assert.equal(
        iconAssetUrlFromResult(result),
        'https://v2.xivapi.com/api/asset?path=ui%2Ficon%2F000000%2F000861_hr1.tex&format=png',
    );
});
