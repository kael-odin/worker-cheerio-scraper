/**
 * Local SDK for testing worker-cheerio-scraper
 * Simulates CafeScraper platform SDK locally
 */

const fs = require('fs');
const path = require('path');

// Results storage
let results = [];
let tableHeaders = [];

// Create SDK mock
const sdk = {
    parameter: {
        getInputJSONString: async function() {
            // Try to read from test-input.json first
            const testInputPath = path.join(__dirname, 'test-input.json');
            if (fs.existsSync(testInputPath)) {
                return fs.readFileSync(testInputPath, 'utf-8');
            }
            // Default test input
            return JSON.stringify({
                startUrls: [{ url: 'https://httpbin.org/html' }],
                maxCrawlingDepth: 1,
                maxPagesPerCrawl: 5,
                maxConcurrency: 2,
                pageLoadTimeoutSecs: 30,
                maxRequestRetries: 1,
                debugLog: true
            });
        },
        getInputJSONObject: async function() {
            const str = await this.getInputJSONString();
            return JSON.parse(str);
        }
    },
    
    result: {
        setTableHeader: async function(headers) {
            tableHeaders = headers;
            console.log('[SDK] Table headers set:', headers.map(h => h.key).join(', '));
        },
        pushData: async function(obj) {
            results.push(obj);
            const preview = obj.title ? obj.title.substring(0, 40) : obj.url?.substring(0, 40) || 'result';
            console.log(`[SDK] Result #${results.length}: ${preview}${obj.error ? ' (ERROR)' : ''}`);
        }
    },
    
    log: {
        debug: async function(msg) {
            console.log(`[DEBUG] ${msg}`);
        },
        info: async function(msg) {
            console.log(`[INFO] ${msg}`);
        },
        warn: async function(msg) {
            console.log(`[WARN] ${msg}`);
        },
        error: async function(msg) {
            console.log(`[ERROR] ${msg}`);
        }
    }
};

// Export results for testing
sdk._getResults = () => results;
sdk._clearResults = () => { results = []; tableHeaders = []; };
sdk._getTableHeaders = () => tableHeaders;

module.exports = sdk;
