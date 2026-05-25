// PROTOTYPE - NOT FOR PRODUCTION
// Question: Can a raid mitigation timeline predict survival and show active coverage?
// Date: 2026-05-25

const assert = require('node:assert/strict');
const test = require('node:test');

const { buildActionSearchUrl, findBestIconResult, iconAssetUrlFromResult, normalizeActionName } = require('../src/icons');

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
    assert.equal(url.searchParams.get('fields'), 'Name,Icon,ClassJobCategory,IsPvP');
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

test('prefers current role action icons over older unassigned action rows', () => {
    const results = [
        {
            row_id: 3626,
            fields: {
                Name: 'Reprisal',
                Icon: { path_hr1: 'ui/icon/003000/003060_hr1.tex' },
                IsPvP: false,
                ClassJobCategory: { fields: { Name: '' } },
            },
        },
        {
            row_id: 7535,
            fields: {
                Name: 'Reprisal',
                Icon: { path_hr1: 'ui/icon/000000/000806_hr1.tex' },
                IsPvP: false,
                ClassJobCategory: { fields: { Name: 'GLA MRD PLD WAR DRK GNB' } },
            },
        },
    ];

    assert.equal(findBestIconResult(results, 'Reprisal')?.row_id, 7535);
});

test('prefers current melee Feint icon over older unassigned action rows', () => {
    const results = [
        {
            row_id: 56,
            fields: {
                Name: 'Feint',
                Icon: { path_hr1: 'ui/icon/000000/000307_hr1.tex' },
                IsPvP: false,
                ClassJobCategory: { fields: { Name: '' } },
            },
        },
        {
            row_id: 7549,
            fields: {
                Name: 'Feint',
                Icon: { path_hr1: 'ui/icon/000000/000828_hr1.tex' },
                IsPvP: false,
                ClassJobCategory: { fields: { Name: 'PGL LNC ROG MNK DRG NIN SAM RPR VPR' } },
            },
        },
    ];

    assert.equal(findBestIconResult(results, 'Feint')?.row_id, 7549);
});
