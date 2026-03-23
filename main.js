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

const cafesdk = require('./sdk')
const cheerio = require('cheerio')
const puppeteer = require('puppeteer')

// Default configuration
const DEFAULT_CONFIG = {
    startUrls: [],
    linkSelector: 'a[href]',
    globPatterns: [],
    pseudoUrls: [],
    excludePatterns: [],
    maxCrawlingDepth: 1,
    maxPagesPerCrawl: 100,
    maxConcurrency: 10,
    pageLoadTimeoutSecs: 60,
    maxRequestRetries: 3,
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
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.browser = null
        this.visitedUrls = new Set()
        this.queue = []
        this.pagesProcessed = 0
        this.successCount = 0
        this.failCount = 0
        this.results = []
        
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
            this.browser.disconnect()
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
            // Block images, styles, fonts, media
            if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
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
            
            // Fetch page with timeout handling
            let fetchResult
            try {
                fetchResult = await this.fetchPage(url, page)
            } catch (fetchError) {
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
        
        await cafesdk.log.info(`🚀 Starting Cheerio Scraper`)
        await cafesdk.log.info(`   URLs: ${startUrls.length} | Depth: ${this.config.maxCrawlingDepth} | Max Pages: ${this.config.maxPagesPerCrawl}`)
        
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
        
        // Create page pool
        const pagePool = []
        const maxPages = Math.min(this.config.maxConcurrency, 5)
        
        async function createNewPage() {
            return await this.createPage()
        }
        
        for (let i = 0; i < maxPages; i++) {
            const page = await createNewPage.call(this)
            pagePool.push({ page, busy: false })
        }
        
        async function getAvailablePage() {
            while (true) {
                const available = pagePool.find(p => !p.busy)
                if (available) {
                    available.busy = true
                    return available
                }
                await this.delay(100)
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
                    pageHolder.page = await createNewPage.call(this)
                } catch (e) {
                    await cafesdk.log.warn(`Failed to recreate page: ${e.message}`)
                }
            }
        }
        
        // Process queue
        const processingPromises = new Set()
        
        while (this.queue.length > 0 || processingPromises.size > 0) {
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
                
                const { url, depth } = this.queue.shift()
                
                // Check depth limit
                if (depth > this.config.maxCrawlingDepth) {
                    continue
                }
                
                this.pagesProcessed++
                
                const promise = (async () => {
                    let retries = 0
                    let result = null
                    let lastError = null
                    
                    while (retries <= this.config.maxRequestRetries) {
                        const pageHolder = await getAvailablePage.call(this)
                        
                        try {
                            result = await this.processPage(url, depth, pageHolder.page)
                            await releasePage.call(this, pageHolder, false)
                            break
                        } catch (err) {
                            lastError = err
                            const isTimeout = err.message && err.message.includes('timeout')
                            // Recreate page on error (especially timeout)
                            await releasePage.call(this, pageHolder, true)
                            retries++
                            
                            if (retries <= this.config.maxRequestRetries) {
                                if (this.config.debugLog) {
                                    await cafesdk.log.debug(`Retry ${retries}/${this.config.maxRequestRetries} for ${url}${isTimeout ? ' (timeout)' : ''}`)
                                }
                                await this.delay(1000 * retries)
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
                            this.failCount++
                        } else {
                            this.successCount++
                        }
                    }
                    
                    processingPromises.delete(promise)
                })()
                
                processingPromises.add(promise)
            }
            
            // Wait a bit
            if (processingPromises.size >= this.config.maxConcurrency || this.queue.length === 0) {
                await this.delay(100)
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
        
        // Summary
        await cafesdk.log.info(`✅ Complete! Total: ${this.pagesProcessed} | Success: ${this.successCount} | Failed: ${this.failCount}`)
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
