#!/usr/bin/env node
'use strict'

/**
 * Cheerio Scraper Worker
 * 
 * Converted from Apify's cheerio-scraper actor.
 * Uses CDP browser for reliable proxy support on CafeScraper platform.
 * 
 * Features:
 * - Custom pageFunction support
 * - Link discovery with glob/regex patterns
 * - Depth control
 * - Cookie management
 * - Request headers customization
 */

const cheerio = require('cheerio')
const puppeteer = require('puppeteer')

/**
 * Auto-detect runtime environment and load correct SDK
 * Priority:
 * 1. global.cafesdk already set (test script override)
 * 2. LOCAL_DEV=1 → local SDK
 * 3. Default → cloud SDK (fallback to local on failure)
 */
function getSDK() {
    // Test script override
    if (global.cafesdk) return global.cafesdk;
    
    // Local development mode
    if (process.env.LOCAL_DEV === '1') {
        return require('./sdk_local');
    }
    
    // Cafe cloud environment
    try {
        return require('./sdk');
    } catch (err) {
        console.log('[WARN] Failed to load gRPC SDK, falling back to local SDK');
        return require('./sdk_local');
    }
}

// Proxy for lazy SDK loading
const cafesdk = new Proxy({}, {
    get: function(target, prop) {
        return getSDK()[prop];
    }
});

// Default configuration
const DEFAULT_CONFIG = {
    startUrls: [],
    linkSelector: 'a[href]',
    globPatterns: [],
    pseudoUrls: [],
    excludePatterns: [],
    maxCrawlingDepth: 1,
    maxPagesPerCrawl: 50,
    maxConcurrency: 3,
    pageLoadTimeoutSecs: 20,
    maxRequestRetries: 1,
    keepUrlFragments: false,
    ignoreSslErrors: true,
    debugLog: false,
    // Default page function - extract basic page data
    pageFunction: `
        async function pageFunction(context) {
            const { $, request, response } = context;

            return {
                url: request.url,
                title: $('title').text().trim(),
                description: $('meta[name="description"]').attr('content') || '',
                h1: $('h1').first().text().trim(),
                textContent: $('body').text().replace(/\\s+/g, ' ').trim().substring(0, 1000),
                linkCount: $('a[href]').length,
                imageCount: $('img').length,
            };
        }
    `
}

/**
 * URL normalization
 */
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

/**
 * Check if URL matches glob pattern
 */
function matchesGlob(url, pattern) {
    if (!pattern) return false
    const regexStr = pattern
        .replace(/[.+^${}()|[\]\\]/g, '\\$&')
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
    return new RegExp(`^${regexStr}$`, 'i').test(url)
}

/**
 * Check if URL matches pseudo URL pattern
 */
function matchesPseudoUrl(url, purl) {
    if (!purl) return false
    try {
        const regex = new RegExp(purl)
        return regex.test(url)
    } catch {
        return false
    }
}

/**
 * Check if URL should be excluded
 */
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

/**
 * Get domain from URL
 */
function getDomain(url) {
    try {
        return new URL(url).hostname
    } catch {
        return ''
    }
}

class CheerioScraper {
    constructor(config) {
        // Normalize config - handle various formats for linkSelector
        const normalizedConfig = { ...config }
        
        // Handle linkSelector: can be string (textfield) or array (stringList legacy)
        if (Array.isArray(config.linkSelector)) {
            // stringList returns [{string: "value"}] or ["value"]
            const first = config.linkSelector[0]
            if (first && typeof first === 'object' && first.string) {
                normalizedConfig.linkSelector = first.string
            } else if (typeof first === 'string') {
                normalizedConfig.linkSelector = first
            } else {
                normalizedConfig.linkSelector = DEFAULT_CONFIG.linkSelector
            }
        } else if (typeof config.linkSelector === 'string' && config.linkSelector.trim()) {
            // textfield returns string directly
            normalizedConfig.linkSelector = config.linkSelector.trim()
        }
        
        this.config = { ...DEFAULT_CONFIG, ...normalizedConfig }
        this.browser = null
        this.visitedUrls = new Set()
        this.queue = []
        this.pagesProcessed = 0
        this.successCount = 0
        this.failCount = 0
        this.results = []
        this.failedDomains = new Set()
        this.domainFailCount = {}
        this.startTime = Date.now()
        
        // Parse and compile page function
        this.pageFunction = this._compilePageFunction(config.pageFunction)
    }

    _compilePageFunction(fnString) {
        if (!fnString) return null
        try {
            // Extract function body if wrapped in async function
            let fnBody = fnString.trim()
            if (fnBody.startsWith('async function')) {
                fnBody = fnBody.replace(/^async function\s+\w*\s*\(/, 'async (')
            }
            return new Function('context', `return (${fnBody})(context)`)
        } catch (err) {
            return null
        }
    }

    async init() {
        await cafesdk.log.info('Initializing Cheerio Scraper Worker...')
        
        const proxyAuth = process.env.PROXY_AUTH
        let browserWSEndpoint
        
        if (proxyAuth) {
            browserWSEndpoint = `ws://${proxyAuth}@chrome-ws-inner.cafescraper.com`
            await cafesdk.log.info('Using CafeScraper platform browser')
        } else if (process.env.CDP_ENDPOINT) {
            browserWSEndpoint = process.env.CDP_ENDPOINT
        } else if (process.env.BROWSER_WS_ENDPOINT) {
            browserWSEndpoint = process.env.BROWSER_WS_ENDPOINT
        } else if (process.env.LOCAL_DEV === '1') {
            // Local development mode: launch local browser
            await cafesdk.log.info('LOCAL_DEV mode: launching local browser')
            this.browser = await puppeteer.launch({
                headless: true,
                ignoreHTTPSErrors: this.config.ignoreSslErrors,
                args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox']
            })
            this.isLocalBrowser = true
            await cafesdk.log.info('Local browser launched')
            return
        } else {
            throw new Error('No browser endpoint configured. PROXY_AUTH should be set by CafeScraper platform.')
        }
        
        this.browser = await puppeteer.connect({
            browserWSEndpoint,
            defaultViewport: null,
            ignoreHTTPSErrors: this.config.ignoreSslErrors
        })
        
        await cafesdk.log.info('Connected to browser')
    }

    async close() {
        if (this.browser) {
            if (this.isLocalBrowser) {
                await this.browser.close()
            } else {
                this.browser.disconnect()
            }
        }
    }

    parseStartUrls(input) {
        const urls = []
        const processItem = (item) => {
            if (typeof item === 'string') {
                return normalizeUrl(item.trim(), this.config.keepUrlFragments)
            }
            if (item && item.url) {
                return normalizeUrl(item.url.trim(), this.config.keepUrlFragments)
            }
            return null
        }
        
        // Process startUrls
        if (input.startUrls) {
            if (Array.isArray(input.startUrls)) {
                for (const item of input.startUrls) {
                    const url = processItem(item)
                    if (url) urls.push({ url, depth: 0 })
                }
            }
        }
        
        // Process url field (CafeScraper format)
        if (input.url) {
            if (Array.isArray(input.url)) {
                for (const item of input.url) {
                    const url = processItem(item)
                    if (url) urls.push({ url, depth: 0 })
                }
            } else if (typeof input.url === 'string') {
                urls.push({ url: processItem(input.url), depth: 0 })
            } else if (typeof input.url === 'object') {
                const url = processItem(input.url)
                if (url) urls.push({ url, depth: 0 })
            }
        }
        
        return urls
    }

    async createPage() {
        const page = await this.browser.newPage()

        // Block unnecessary resources for speed
        await page.setRequestInterception(true)

        page.on('request', (request) => {
            const resourceType = request.resourceType()
            const url = request.url()

            // Block images, styles, fonts, media
            if (['image', 'stylesheet', 'font', 'media', 'manifest'].includes(resourceType)) {
                request.abort()
                return
            }

            // Block known tracking/analytics scripts
            const blockedPatterns = [
                'google-analytics.com', 'googletagmanager.com', 'analytics.',
                'facebook.net', 'hotjar.com', 'fullstory.com',
                'sentry.io', 'newrelic.com', 'datadog',
                'intercom.io', 'crisp.chat', 'tawk.to',
                'doubleclick.net', 'googlesyndication.com',
            ]
            if (blockedPatterns.some(p => url.includes(p))) {
                request.abort()
                return
            }

            request.continue()
        })

        page.setDefaultTimeout(this.config.pageLoadTimeoutSecs * 1000)

        return page
    }

    async fetchPage(url, page) {
        try {
            const response = await page.goto(url, {
                waitUntil: 'domcontentloaded',
                timeout: this.config.pageLoadTimeoutSecs * 1000
            })
            
            // Check if page is still available
            if (page.isClosed()) {
                throw new Error('Page was closed')
            }
            
            const html = await page.content()
            
            return {
                html,
                statusCode: response ? response.status() : 200,
                response
            }
        } catch (error) {
            // Log specific error type
            if (error.message && error.message.includes('timeout')) {
                throw new Error(`Navigation timeout: ${url}`)
            }
            if (error.message && error.message.includes('net::')) {
                throw new Error(`Network error: ${error.message}`)
            }
            throw error
        }
    }

    async discoverLinks($, currentUrl, currentDepth) {
        if (!this.config.linkSelector || currentDepth >= this.config.maxCrawlingDepth) {
            return []
        }
        
        const links = []
        const currentDomain = getDomain(currentUrl)
        
        $(this.config.linkSelector).each((_, element) => {
            try {
                const href = $(element).attr('href')
                if (!href) return
                
                // Skip anchors and javascript
                if (href.startsWith('#') || href.startsWith('javascript:')) return
                
                // Resolve relative URLs
                const absoluteUrl = new URL(href, currentUrl).href
                
                // Only follow HTTP(S) links
                if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) return
                
                // Check glob patterns (if specified, only match those)
                const { globPatterns, pseudoUrls } = this.config
                if (globPatterns && globPatterns.length > 0) {
                    if (!globPatterns.some(p => matchesGlob(absoluteUrl, p.glob || p))) return
                }
                if (pseudoUrls && pseudoUrls.length > 0) {
                    if (!pseudoUrls.some(p => matchesPseudoUrl(absoluteUrl, p.purl || p))) return
                }
                
                // Check exclude patterns
                if (shouldExclude(absoluteUrl, this.config.excludePatterns)) return
                
                // Normalize and deduplicate
                const normalizedUrl = normalizeUrl(absoluteUrl, this.config.keepUrlFragments)
                if (!this.visitedUrls.has(normalizedUrl)) {
                    links.push({ url: normalizedUrl, depth: currentDepth + 1 })
                    this.visitedUrls.add(normalizedUrl)
                }
            } catch (e) {
                // Invalid URL, skip
            }
        })
        
        return links
    }

    async processPage(url, depth, page) {
        if (this.config.debugLog) {
            await cafesdk.log.debug(`Processing: ${url} (depth: ${depth})`)
        }

        try {
            // Check exclude patterns
            if (shouldExclude(url, this.config.excludePatterns)) {
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Skipping excluded URL: ${url}`)
                }
                return null
            }

            // Skip URLs from domains that have failed too many times
            const domain = getDomain(url)
            if (this.failedDomains.has(domain)) {
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Skipping known-bad domain: ${domain}`)
                }
                return {
                    url,
                    depth,
                    error: `Domain skipped: ${domain} had too many failures`,
                    statusCode: null
                }
            }

            // Fetch page with timeout handling
            let fetchResult
            try {
                fetchResult = await this.fetchPage(url, page)
                // Reset domain fail count on success
                this.domainFailCount[domain] = 0
            } catch (fetchError) {
                // Track domain failures
                this.domainFailCount[domain] = (this.domainFailCount[domain] || 0) + 1
                if (this.domainFailCount[domain] >= 3) {
                    this.failedDomains.add(domain)
                    await cafesdk.log.warn(`Domain ${domain} marked as bad after ${this.domainFailCount[domain]} failures`)
                }
                // If fetch fails, try to recover the page
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Fetch failed for ${url}: ${fetchError.message}`)
                }
                throw fetchError
            }
            
            const { html, statusCode } = fetchResult
            
            // Parse with Cheerio
            const $ = cheerio.load(html)
            
            // Create context for page function
            const context = {
                $,
                request: { url, depth },
                response: { status: statusCode },
                html,
                cheerio: $
            }
            
            // Execute page function
            let result = {}
            if (this.pageFunction) {
                try {
                    result = await this.pageFunction(context) || {}
                } catch (err) {
                    await cafesdk.log.warn(`Page function error: ${err.message}`)
                }
            }
            
            // Add metadata
            result.url = url
            result.depth = depth
            result.statusCode = statusCode
            result.loadedAt = new Date().toISOString()
            
            // Discover new links
            const newLinks = await this.discoverLinks($, url, depth)
            result.linksFound = newLinks.length
            
            // Add links to queue
            for (const link of newLinks) {
                this.queue.push(link)
            }
            
            return result
            
        } catch (error) {
            const errorMsg = error.message || 'Unknown error'
            await cafesdk.log.error(`Failed: ${url} - ${errorMsg}`)
            return {
                url,
                depth,
                error: errorMsg,
                statusCode: null
            }
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    async run(startUrls) {
        if (!startUrls || startUrls.length === 0) {
            throw new Error('No start URLs provided')
        }
        
        // Initialize
        await this.init()
        
        // Initialize queue and visited set
        for (const item of startUrls) {
            const normalizedUrl = normalizeUrl(item.url, this.config.keepUrlFragments)
            this.queue.push({ url: normalizedUrl, depth: item.depth || 0 })
            this.visitedUrls.add(normalizedUrl)
        }
        
        // Overall timeout: 8 minutes max
        const overallTimeoutMs = 8 * 60 * 1000
        this.startTime = Date.now()
        
        await cafesdk.log.info(`Starting Cheerio Scraper`)
        await cafesdk.log.info(`   URLs: ${startUrls.length} | Depth: ${this.config.maxCrawlingDepth} | Max Pages: ${this.config.maxPagesPerCrawl}`)
        await cafesdk.log.info(`   Timeout: ${this.config.pageLoadTimeoutSecs}s | Concurrency: ${this.config.maxConcurrency} | Retries: ${this.config.maxRequestRetries}`)
        
        // Set table headers
        const headers = [
            { label: 'URL', key: 'url', format: 'text' },
            { label: 'Title', key: 'title', format: 'text' },
            { label: 'Description', key: 'description', format: 'text' },
            { label: 'Depth', key: 'depth', format: 'integer' },
            { label: 'Status', key: 'statusCode', format: 'integer' },
            { label: 'Links', key: 'linksFound', format: 'integer' }
        ]
        await cafesdk.result.setTableHeader(headers)
        
        // Create page pool - limit to maxConcurrency
        const pagePool = []
        const maxPages = Math.min(this.config.maxConcurrency, 5)
        
        const self = this
        
        async function createNewPage() {
            return await self.createPage()
        }
        
        for (let i = 0; i < maxPages; i++) {
            const page = await createNewPage()
            pagePool.push({ page, busy: false })
        }
        
        async function getAvailablePage() {
            while (true) {
                const available = pagePool.find(p => !p.busy)
                if (available) {
                    available.busy = true
                    return available
                }
                await self.delay(50)
            }
        }
        
        async function releasePage(pageHolder, recreate = false) {
            pageHolder.busy = false
            // If page had error, close it and create new one
            if (recreate) {
                try {
                    await pageHolder.page.close()
                } catch (e) {}
                try {
                    pageHolder.page = await createNewPage()
                } catch (e) {
                    await cafesdk.log.warn(`Failed to recreate page: ${e.message}`)
                }
            }
        }
        
        // Process queue with overall timeout check
        const processingPromises = new Set()
        
        while (this.queue.length > 0 || processingPromises.size > 0) {
            // Check overall timeout
            if (Date.now() - this.startTime > overallTimeoutMs) {
                await cafesdk.log.warn(`Overall timeout reached (${overallTimeoutMs / 1000}s), stopping`)
                break
            }
            
            // Check page limit
            if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                await cafesdk.log.info(`Reached max pages: ${this.config.maxPagesPerCrawl}`)
                break
            }
            
            // Start new requests if we have capacity
            while (this.queue.length > 0 && processingPromises.size < this.config.maxConcurrency) {
                if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                    break
                }
                
                // Check overall timeout
                if (Date.now() - this.startTime > overallTimeoutMs) {
                    break
                }
                
                const { url, depth } = this.queue.shift()
                
                // Check depth limit
                if (depth > this.config.maxCrawlingDepth) {
                    continue
                }
                
                // Skip URLs from failed domains early
                const domain = getDomain(url)
                if (this.failedDomains.has(domain)) {
                    this.pagesProcessed++
                    this.failCount++
                    await cafesdk.result.pushData({
                        url,
                        depth,
                        error: `Domain skipped: ${domain}`,
                        statusCode: null
                    })
                    continue
                }
                
                this.pagesProcessed++
                
                const promise = (async () => {
                    let retries = 0
                    let result = null
                    let lastError = null
                    
                    while (retries <= this.config.maxRequestRetries) {
                        const pageHolder = await getAvailablePage()
                        
                        try {
                            result = await self.processPage(url, depth, pageHolder.page)
                            await releasePage(pageHolder, false)
                            break
                        } catch (err) {
                            lastError = err
                            const isTimeout = err.message && err.message.includes('timeout')
                            // Recreate page on error (especially timeout)
                            await releasePage(pageHolder, true)
                            retries++
                            
                            if (retries <= self.config.maxRequestRetries) {
                                if (self.config.debugLog) {
                                    await cafesdk.log.debug(`Retry ${retries}/${self.config.maxRequestRetries} for ${url}${isTimeout ? ' (timeout)' : ''}`)
                                }
                                await self.delay(500 * retries)
                            } else {
                                result = {
                                    url,
                                    depth,
                                    error: lastError.message || 'Unknown error',
                                    statusCode: null
                                }
                            }
                        }
                    }
                    
                    if (result) {
                        await cafesdk.result.pushData(result)
                        if (result.error) {
                            self.failCount++
                        } else {
                            self.successCount++
                        }
                    }
                    
                    processingPromises.delete(promise)
                })()
                
                processingPromises.add(promise)
                
                // Stagger CDP connections by 100ms to avoid connection storms
                if (processingPromises.size < self.config.maxConcurrency) {
                    await self.delay(100)
                }
            }
            
            // Wait a bit
            if (processingPromises.size >= this.config.maxConcurrency || this.queue.length === 0) {
                await this.delay(50)
            }
        }
        
        // Wait for all remaining
        await Promise.all(processingPromises)
        
        // Close pages
        for (const { page } of pagePool) {
            await page.close().catch(() => {})
        }
        
        // Close browser
        await this.close()
        
        const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1)
        
        // Summary
        await cafesdk.log.info(`Complete! Total: ${this.pagesProcessed} | Success: ${this.successCount} | Failed: ${this.failCount} | Time: ${elapsed}s`)
        if (this.failedDomains.size > 0) {
            await cafesdk.log.info(`Skipped domains: ${[...this.failedDomains].join(', ')}`)
        }
    }
}

/**
 * Main function
 */
async function main() {
    try {
        await cafesdk.log.info('Cheerio Scraper Worker started')
        
        const input = await cafesdk.parameter.getInputJSONObject()
        await cafesdk.log.debug(`Input: ${JSON.stringify(input)}`)
        
        const scraper = new CheerioScraper(input)
        const startUrls = scraper.parseStartUrls(input)
        
        await scraper.run(startUrls)
        
    } catch (error) {
        await cafesdk.log.error(`Script error: ${error.message}`)
        await cafesdk.result.pushData({
            error: error.message,
            status: 'error'
        })
        throw error
    }
}

main()
