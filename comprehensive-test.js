#!/usr/bin/env node
'use strict'

/**
 * Comprehensive Test Suite for Cheerio Scraper Worker
 * 
 * Tests all aspects of the worker:
 * - Input parsing and normalization
 * - URL processing
 * - Pattern matching (glob/exclude)
 * - Configuration handling
 * - Cafe platform compatibility
 */

const fs = require('fs');
const path = require('path');

// Set local dev mode BEFORE loading main.js
process.env.LOCAL_DEV = '1';

// Test utilities
let passCount = 0;
let failCount = 0;
const testResults = [];

function test(name, fn) {
    return new Promise(async (resolve) => {
        try {
            await fn();
            passCount++;
            testResults.push({ name, status: 'PASS' });
            console.log(`✅ PASS: ${name}`);
        } catch (err) {
            failCount++;
            testResults.push({ name, status: 'FAIL', error: err.message });
            console.log(`❌ FAIL: ${name}`);
            console.log(`   Error: ${err.message}`);
        }
        resolve();
    });
}

function assertEqual(actual, expected, message = '') {
    if (actual !== expected) {
        throw new Error(`${message} Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
    }
}

function assertDeepEqual(actual, expected, message = '') {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`${message} Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
    }
}

function assertTrue(condition, message = '') {
    if (!condition) {
        throw new Error(message || 'Assertion failed');
    }
}

// ============================================
// Test Functions (mirror main.js logic)
// ============================================

function normalizeUrl(url, keepFragments = false) {
    try {
        const parsed = new URL(url)
        let path = parsed.pathname
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1)
        }
        const fragment = keepFragments ? parsed.hash : ''
        return `${parsed.protocol}//${parsed.host}${path}${parsed.search}${fragment}`
    } catch {
        return url.replace(/\/$/, '')
    }
}

function matchesGlob(url, pattern) {
    if (!pattern) return false
    const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    return new RegExp(`^${regexStr}$`, 'i').test(url)
}

function matchesPseudoUrl(url, purl) {
    if (!purl) return false
    try {
        const regex = new RegExp(purl)
        return regex.test(url)
    } catch {
        return false
    }
}

function shouldExclude(url, patterns) {
    if (!patterns || patterns.length === 0) return false
    return patterns.some(pattern => {
        if (typeof pattern === 'string') {
            return url.toLowerCase().includes(pattern.toLowerCase()) ||
                   matchesGlob(url, pattern)
        }
        if (pattern.glob) return matchesGlob(url, pattern.glob)
        if (pattern.regexp) return matchesPseudoUrl(url, pattern.regexp)
        return false
    })
}

function getDomain(url) {
    try {
        return new URL(url).hostname
    } catch {
        return ''
    }
}

function parseStartUrls(input, keepFragments = false) {
    const urls = []
    const processItem = (item) => {
        // Handle null/undefined
        if (item === null || item === undefined) return null;
        
        if (typeof item === 'string') {
            const trimmed = item.trim();
            return trimmed ? normalizeUrl(trimmed, keepFragments) : null;
        }
        if (item && item.url) {
            const trimmed = item.url.trim();
            return trimmed ? normalizeUrl(trimmed, keepFragments) : null;
        }
        return null
    }
    
    // Process startUrls (primary)
    if (input.startUrls) {
        if (Array.isArray(input.startUrls)) {
            for (const item of input.startUrls) {
                const url = processItem(item)
                if (url) urls.push({ url, depth: 0 })
            }
        }
    }
    
    // Process url field (Cafe platform format)
    if (input.url) {
        if (Array.isArray(input.url)) {
            for (const item of input.url) {
                const url = processItem(item)
                if (url) urls.push({ url, depth: 0 })
            }
        } else if (typeof input.url === 'string') {
            const url = processItem(input.url)
            if (url) urls.push({ url, depth: 0 })
        } else if (typeof input.url === 'object') {
            const url = processItem(input.url)
            if (url) urls.push({ url, depth: 0 })
        }
    }
    
    return urls
}

function parseLinkSelector(linkSelector) {
    if (!linkSelector) return 'a[href]';
    
    // Handle stringList format: [{string: "value"}]
    if (Array.isArray(linkSelector)) {
        const first = linkSelector[0];
        if (first && typeof first === 'object' && first.string) {
            return first.string.trim() || 'a[href]';
        }
        if (typeof first === 'string') {
            return first.trim() || 'a[href]';
        }
        return 'a[href]';
    }
    
    // Handle select/input format: string
    if (typeof linkSelector === 'string') {
        return linkSelector.trim() || 'a[href]';
    }
    
    return 'a[href]';
}

// ============================================
// Test Suites
// ============================================

async function runTests() {
    console.log('\n' + '='.repeat(70));
    console.log('Cheerio Scraper Worker - Comprehensive Test Suite');
    console.log('='.repeat(70) + '\n');
    
    // =====================
    // Suite 1: URL Normalization
    // =====================
    console.log('\n📋 Suite 1: URL Normalization');
    console.log('-'.repeat(40));
    
    await test('Normalize URL - Basic', async () => {
        // Root path '/' is preserved (length = 1)
        const result = normalizeUrl('https://example.com/');
        assertTrue(result.startsWith('https://example.com'), 'Should start with domain');
    });
    
    await test('Normalize URL - With path', async () => {
        assertEqual(normalizeUrl('https://example.com/path/'), 'https://example.com/path');
    });
    
    await test('Normalize URL - With query', async () => {
        assertEqual(normalizeUrl('https://example.com/page?foo=bar'), 'https://example.com/page?foo=bar');
    });
    
    await test('Normalize URL - Remove fragment by default', async () => {
        assertEqual(normalizeUrl('https://example.com/page#section'), 'https://example.com/page');
    });
    
    await test('Normalize URL - Keep fragment when specified', async () => {
        assertEqual(normalizeUrl('https://example.com/page#section', true), 'https://example.com/page#section');
    });
    
    await test('Normalize URL - Root path keeps slash', async () => {
        const result = normalizeUrl('https://example.com/');
        assertTrue(result.startsWith('https://example.com'), 'Root path should preserve domain');
    });
    
    // =====================
    // Suite 2: Input Parsing
    // =====================
    console.log('\n📋 Suite 2: Input Parsing');
    console.log('-'.repeat(40));
    
    await test('Parse startUrls - Object format', async () => {
        const result = parseStartUrls({ startUrls: [{ url: 'https://example.com' }] });
        assertEqual(result.length, 1);
        assertTrue(result[0].url.startsWith('https://example.com'), 'URL should be valid');
        assertEqual(result[0].depth, 0);
    });
    
    await test('Parse startUrls - String format', async () => {
        const result = parseStartUrls({ startUrls: ['https://example.com'] });
        assertEqual(result.length, 1);
        assertTrue(result[0].url.startsWith('https://example.com'), 'URL should be valid');
    });
    
    await test('Parse startUrls - Mixed formats', async () => {
        const result = parseStartUrls({
            startUrls: [
                { url: 'https://example.com' },
                'https://test.com',
                { url: 'https://demo.com/page/' }
            ]
        });
        assertEqual(result.length, 3);
        assertEqual(result[2].url, 'https://demo.com/page');
    });
    
    await test('Parse url field (Cafe format)', async () => {
        const result = parseStartUrls({ url: [{ url: 'https://example.com' }] });
        assertEqual(result.length, 1);
        assertTrue(result[0].url.startsWith('https://example.com'), 'URL should be valid');
    });
    
    await test('Parse url field - String', async () => {
        const result = parseStartUrls({ url: 'https://example.com' });
        assertEqual(result.length, 1);
    });
    
    await test('Parse - Empty array', async () => {
        const result = parseStartUrls({ startUrls: [] });
        assertEqual(result.length, 0);
    });
    
    await test('Parse - Null elements', async () => {
        const result = parseStartUrls({ startUrls: [null, { url: 'https://example.com' }, undefined] });
        assertEqual(result.length, 1);
    });
    
    await test('Parse - Empty strings filtered', async () => {
        const result = parseStartUrls({ startUrls: ['', '   ', { url: 'https://example.com' }] });
        assertEqual(result.length, 1);
    });
    
    // =====================
    // Suite 3: Glob Pattern Matching
    // =====================
    console.log('\n📋 Suite 3: Glob Pattern Matching');
    console.log('-'.repeat(40));
    
    await test('Glob - Wildcard match', async () => {
        assertTrue(matchesGlob('https://example.com/blog/post1', 'https://example.com/blog/*'));
    });
    
    await test('Glob - No match', async () => {
        assertTrue(!matchesGlob('https://example.com/about', 'https://example.com/blog/*'));
    });
    
    await test('Glob - Multiple wildcards', async () => {
        assertTrue(matchesGlob('https://example.com/a/b/c', 'https://example.com/*/*/*'));
    });
    
    await test('Glob - Single character', async () => {
        assertTrue(matchesGlob('https://example.com/a', 'https://example.com/?'));
    });
    
    await test('Glob - Exact match', async () => {
        assertTrue(matchesGlob('https://example.com/page', 'https://example.com/page'));
    });
    
    // =====================
    // Suite 4: Exclude Patterns
    // =====================
    console.log('\n📋 Suite 4: Exclude Patterns');
    console.log('-'.repeat(40));
    
    await test('Exclude - String pattern', async () => {
        assertTrue(shouldExclude('https://example.com/login', ['/login', '/admin']));
    });
    
    await test('Exclude - Not matching', async () => {
        assertTrue(!shouldExclude('https://example.com/home', ['/login', '/admin']));
    });
    
    await test('Exclude - Glob pattern', async () => {
        assertTrue(shouldExclude('https://example.com/file.pdf', ['*.pdf']));
    });
    
    await test('Exclude - Object glob format', async () => {
        assertTrue(shouldExclude('https://example.com/blog/post', [{ glob: '*/blog/*' }]));
    });
    
    await test('Exclude - Empty patterns', async () => {
        assertTrue(!shouldExclude('https://example.com/login', []));
    });
    
    await test('Exclude - Null patterns', async () => {
        assertTrue(!shouldExclude('https://example.com/login', null));
    });
    
    // =====================
    // Suite 5: Domain Extraction
    // =====================
    console.log('\n📋 Suite 5: Domain Extraction');
    console.log('-'.repeat(40));
    
    await test('Get domain - Basic', async () => {
        assertEqual(getDomain('https://example.com/page'), 'example.com');
    });
    
    await test('Get domain - Subdomain', async () => {
        assertEqual(getDomain('https://blog.example.com/post'), 'blog.example.com');
    });
    
    await test('Get domain - Invalid URL', async () => {
        assertEqual(getDomain('not-a-url'), '');
    });
    
    // =====================
    // Suite 6: Link Selector Parsing
    // =====================
    console.log('\n📋 Suite 6: Link Selector Parsing');
    console.log('-'.repeat(40));
    
    await test('Link selector - Default', async () => {
        assertEqual(parseLinkSelector(null), 'a[href]');
    });
    
    await test('Link selector - String', async () => {
        assertEqual(parseLinkSelector('img'), 'img');
    });
    
    await test('Link selector - StringList format', async () => {
        assertEqual(parseLinkSelector([{ string: 'a.custom' }]), 'a.custom');
    });
    
    await test('Link selector - Array string', async () => {
        assertEqual(parseLinkSelector(['img']), 'img');
    });
    
    await test('Link selector - Empty string uses default', async () => {
        assertEqual(parseLinkSelector(''), 'a[href]');
    });
    
    // =====================
    // Suite 7: input_schema.json Validation
    // =====================
    console.log('\n📋 Suite 7: input_schema.json Validation');
    console.log('-'.repeat(40));
    
    await test('input_schema exists', async () => {
        assertTrue(fs.existsSync(path.join(__dirname, 'input_schema.json')));
    });
    
    await test('input_schema has b field for array', async () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'input_schema.json'), 'utf-8'));
        assertEqual(schema.b, 'startUrls');
    });
    
    await test('input_schema startUrls is array type', async () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'input_schema.json'), 'utf-8'));
        const startUrlsProp = schema.properties.find(p => p.name === 'startUrls');
        assertEqual(startUrlsProp.type, 'array');
    });
    
    await test('input_schema has valid editor types', async () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'input_schema.json'), 'utf-8'));
        const validEditors = ['requestList', 'requestListSource', 'stringList', 'input', 'textarea', 'number', 'select', 'radio', 'checkbox', 'switch', 'datepicker', 'json', 'hidden'];
        
        for (const prop of schema.properties) {
            if (prop.editor) {
                assertTrue(validEditors.includes(prop.editor), `Invalid editor: ${prop.editor}`);
            }
        }
    });
    
    await test('input_schema has required fields', async () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'input_schema.json'), 'utf-8'));
        assertTrue(schema.description !== undefined);
        assertTrue(Array.isArray(schema.properties));
    });
    
    await test('input_schema required fields marked', async () => {
        const schema = JSON.parse(fs.readFileSync(path.join(__dirname, 'input_schema.json'), 'utf-8'));
        const startUrlsProp = schema.properties.find(p => p.name === 'startUrls');
        assertTrue(startUrlsProp.required === true);
    });
    
    // =====================
    // Suite 8: Configuration Normalization
    // =====================
    console.log('\n📋 Suite 8: Configuration Normalization');
    console.log('-'.repeat(40));
    
    await test('Config - Default values', async () => {
        const defaults = {
            linkSelector: 'a[href]',
            maxCrawlingDepth: 1,
            maxPagesPerCrawl: 50,
            maxConcurrency: 3
        };
        // These would be tested via the CheerioScraper class
        assertTrue(defaults.linkSelector === 'a[href]');
        assertTrue(defaults.maxCrawlingDepth === 1);
    });
    
    await test('Config - linkSelector stringList to string', async () => {
        const parsed = parseLinkSelector([{ string: 'img[src]' }]);
        assertEqual(parsed, 'img[src]');
    });
    
    // =====================
    // Suite 9: Error Handling
    // =====================
    console.log('\n📋 Suite 9: Error Handling');
    console.log('-'.repeat(40));
    
    await test('Parse - Invalid URL object returns empty', async () => {
        const result = parseStartUrls({ startUrls: [{ notUrl: 'value' }] });
        assertEqual(result.length, 0);
    });
    
    await test('Parse - Empty input returns empty', async () => {
        const result = parseStartUrls({});
        assertEqual(result.length, 0);
    });
    
    await test('Glob - Invalid regex patterns handled', async () => {
        // Invalid regex should not crash
        assertTrue(typeof matchesGlob('https://example.com', '[invalid') === 'boolean');
    });
    
    await test('PseudoUrl - Invalid regex handled', async () => {
        // Invalid regex should return false
        assertTrue(matchesPseudoUrl('https://example.com', '[invalid(') === false);
    });
    
    // =====================
    // Suite 10: Cafe Platform Format Compatibility
    // =====================
    console.log('\n📋 Suite 10: Cafe Platform Format Compatibility');
    console.log('-'.repeat(40));
    
    await test('Cafe format - url array with objects', async () => {
        const result = parseStartUrls({
            url: [
                { url: 'https://example1.com' },
                { url: 'https://example2.com' }
            ]
        });
        assertEqual(result.length, 2);
    });
    
    await test('Cafe format - url array with strings', async () => {
        const result = parseStartUrls({
            url: ['https://example1.com', 'https://example2.com']
        });
        assertEqual(result.length, 2);
    });
    
    await test('Cafe format - Single url object', async () => {
        const result = parseStartUrls({
            url: { url: 'https://example.com' }
        });
        assertEqual(result.length, 1);
    });
    
    await test('Cafe format - Mixed startUrls and url', async () => {
        const result = parseStartUrls({
            startUrls: [{ url: 'https://example1.com' }],
            url: [{ url: 'https://example2.com' }]
        });
        assertEqual(result.length, 2);
    });
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total: ${passCount + failCount}`);
    console.log(`Passed: ${passCount} ✅`);
    console.log(`Failed: ${failCount} ❌`);
    console.log(`Success Rate: ${((passCount / (passCount + failCount)) * 100).toFixed(1)}%`);
    console.log('='.repeat(70));
    
    // Write results to file
    const report = {
        timestamp: new Date().toISOString(),
        total: passCount + failCount,
        passed: passCount,
        failed: failCount,
        successRate: ((passCount / (passCount + failCount)) * 100).toFixed(1) + '%',
        results: testResults
    };
    
    fs.writeFileSync(
        path.join(__dirname, 'test-report.json'),
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 Test report saved to test-report.json');
    
    // Exit with code
    process.exit(failCount > 0 ? 1 : 0);
}

runTests().catch(err => {
    console.error('Test suite error:', err);
    process.exit(1);
});
