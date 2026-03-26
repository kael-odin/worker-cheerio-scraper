#!/usr/bin/env node
'use strict'

/**
 * Local Real Test Script for Cheerio Scraper Worker
 * 
 * Tests the worker with real browser interactions.
 * Requires: Chrome with remote debugging enabled (port 9222)
 * 
 * Usage:
 *   1. Start Chrome: chrome.exe --remote-debugging-port=9222
 *   2. Run: node local-real-test.js
 */

// Set environment variables BEFORE loading any modules
process.env.LOCAL_DEV = '1';

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_CONFIG = {
    startUrls: [{ url: 'https://httpbin.org/html' }],
    linkSelector: 'a[href]',
    maxCrawlingDepth: 1,
    maxPagesPerCrawl: 5,
    maxConcurrency: 2,
    pageLoadTimeoutSecs: 30,
    maxRequestRetries: 1,
    ignoreSslErrors: true,
    debugLog: true
};

// Mock SDK
const results = [];
let tableHeaders = [];

const mockSdk = {
    parameter: {
        getInputJSONString: async () => JSON.stringify(TEST_CONFIG),
        getInputJSONObject: async () => TEST_CONFIG
    },
    result: {
        setTableHeader: async (headers) => {
            tableHeaders = headers;
            console.log(`\n📋 Table headers: ${headers.map(h => h.key).join(', ')}`);
        },
        pushData: async (obj) => {
            results.push(obj);
            const preview = obj.title?.substring(0, 50) || obj.url?.substring(0, 50) || 'result';
            const status = obj.error ? '❌' : '✅';
            console.log(`  ${status} Result #${results.length}: ${preview}`);
        }
    },
    log: {
        debug: async (msg) => process.env.DEBUG && console.log(`  [DEBUG] ${msg}`),
        info: async (msg) => console.log(`  [INFO] ${msg}`),
        warn: async (msg) => console.log(`  [WARN] ${msg}`),
        error: async (msg) => console.log(`  [ERROR] ${msg}`)
    }
};

// Set global SDK for main.js
global.cafesdk = mockSdk;

// Import CheerioScraper class
console.log('\n' + '='.repeat(70));
console.log('Cheerio Scraper Worker - Local Real Test');
console.log('='.repeat(70));

async function runTest() {
    const startTime = Date.now();
    
    try {
        console.log('\n📦 Loading worker...');
        
        // Clear require cache
        Object.keys(require.cache).forEach(key => {
            if (key.includes('worker-cheerio-scraper')) {
                delete require.cache[key];
            }
        });
        
        // Load CheerioScraper from main.js
        const mainModule = require('./main.js');
        
        // Since main.js auto-runs, we need to wait for completion
        // The main() function will use global.cafesdk
        
    } catch (err) {
        console.error('Test failed:', err.message);
        console.error(err.stack);
        process.exit(1);
    }
    
    // Wait for results
    const maxWait = 90000;
    const checkInterval = 1000;
    let waited = 0;
    
    await new Promise((resolve) => {
        const check = () => {
            waited += checkInterval;
            if (waited >= maxWait) {
                console.log('\n⏱️  Timeout reached');
                resolve();
                return;
            }
            
            // Check every 5 seconds if we have results
            if (results.length > 0 && waited % 5000 === 0) {
                console.log(`  ⏳ Waiting... (${results.length} results so far)`);
            }
            
            setTimeout(check, checkInterval);
        };
        
        // Start checking after initial delay
        setTimeout(check, 5000);
    });
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(70));
    console.log(`Total results: ${results.length}`);
    console.log(`Successful: ${results.filter(r => !r.error).length}`);
    console.log(`Failed: ${results.filter(r => r.error).length}`);
    console.log(`Duration: ${duration}s`);
    
    if (results.length > 0) {
        console.log('\n📄 Sample results:');
        results.slice(0, 3).forEach((r, i) => {
            console.log(`\n  Result ${i + 1}:`);
            console.log(`    URL: ${r.url}`);
            console.log(`    Title: ${r.title || 'N/A'}`);
            console.log(`    Status: ${r.statusCode || 'N/A'}`);
            if (r.error) {
                console.log(`    Error: ${r.error}`);
            }
        });
    }
    
    // Save results
    const report = {
        timestamp: new Date().toISOString(),
        config: TEST_CONFIG,
        totalResults: results.length,
        successful: results.filter(r => !r.error).length,
        failed: results.filter(r => r.error).length,
        duration,
        results: results.map(r => ({
            url: r.url,
            title: r.title,
            depth: r.depth,
            statusCode: r.statusCode,
            linksFound: r.linksFound,
            error: r.error
        }))
    };
    
    fs.writeFileSync(
        path.join(__dirname, 'local-test-report.json'),
        JSON.stringify(report, null, 2)
    );
    
    console.log('\n📄 Full report saved to local-test-report.json');
    console.log('='.repeat(70));
    
    // Exit based on results
    const success = results.length > 0 && results.some(r => !r.error);
    process.exit(success ? 0 : 1);
}

// Handle process events
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection:', reason);
    process.exit(1);
});

process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    process.exit(1);
});

runTest();
