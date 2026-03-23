#!/usr/bin/env node
'use strict'

const cafesdk = require('./sdk')
const cheerio = require('cheerio')

/**
 * Cheerio Scraper Worker
 * 
 * A lightweight web scraper using HTTP requests and Cheerio for HTML parsing.
 * Much faster than browser-based scrapers as it doesn't render JavaScript.
 * 
 * Features:
 * - HTTP-based crawling (no browser needed)
 * - Cheerio for fast HTML parsing
 * - Link discovery and depth control
 * - Concurrent request handling
 * - Custom data extraction
 */

// Default configuration
const DEFAULT_CONFIG = {
    maxCrawlingDepth: 1,
    maxPagesPerCrawl: 100,
    maxConcurrency: 10,
    requestTimeoutSecs: 30,
    maxRequestRetries: 3,
    ignoreSslErrors: true,
    linkSelector: 'a[href]',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    requestDelayMs: 500,
    debugLog: false
}

/**
 * URL normalization to prevent duplicates
 */
function normalizeUrl(url) {
    try {
        const parsed = new URL(url)
        // Remove trailing slash from path
        let path = parsed.pathname
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1)
        }
        // Remove default port
        const port = parsed.port
        const defaultPorts = { 'http:': '80', 'https:': '443' }
        const host = port && defaultPorts[parsed.protocol] === port
            ? parsed.hostname
            : parsed.host
        return `${parsed.protocol}//${host}${path}${parsed.search}${parsed.hash}`
    } catch {
        return url.replace(/\/$/, '')
    }
}

/**
 * Check if URL belongs to same domain
 */
function isSameDomain(url1, url2) {
    try {
        const u1 = new URL(url1)
        const u2 = new URL(url2)
        return u1.hostname === u2.hostname
    } catch {
        return false
    }
}

class CheerioScraper {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.visitedUrls = new Set()
        this.queue = []
        this.pagesProcessed = 0
        this.results = []
        this.activeRequests = 0
    }

    /**
     * Parse input URLs
     */
    parseStartUrls(input) {
        const urls = []
        if (input.startUrls) {
            if (Array.isArray(input.startUrls)) {
                for (const item of input.startUrls) {
                    if (typeof item === 'string') {
                        urls.push(normalizeUrl(item.trim()))
                    } else if (item.url) {
                        urls.push(normalizeUrl(item.url.trim()))
                    }
                }
            }
        }
        return urls.filter(url => url && url.length > 0)
    }

    /**
     * Fetch a page with retries
     */
    async fetchPage(url, retries = 0) {
        const controller = new AbortController()
        const timeoutId = setTimeout(
            () => controller.abort(),
            this.config.requestTimeoutSecs * 1000
        )

        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.config.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                signal: controller.signal,
                // Node.js 18+ fetch doesn't have ignoreSSL option, handle differently
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`)
            }

            const html = await response.text()
            return { html, headers: Object.fromEntries(response.headers), url: response.url }
        } catch (error) {
            clearTimeout(timeoutId)
            
            if (retries < this.config.maxRequestRetries) {
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Retrying ${url} (attempt ${retries + 2}/${this.config.maxRequestRetries + 1})`)
                }
                await this.delay(this.config.requestDelayMs * 2)
                return this.fetchPage(url, retries + 1)
            }
            throw error
        }
    }

    /**
     * Extract data from HTML using Cheerio
     */
    async extractData($, url) {
        const data = {
            url: url,
            title: $('title').text().trim() || '',
            description: $('meta[name="description"]').attr('content') || '',
            keywords: $('meta[name="keywords"]').attr('content') || '',
            h1: $('h1').first().text().trim() || '',
            h2List: $('h2').slice(0, 5).map((_, el) => $(el).text().trim()).get().filter(Boolean),
            textLength: $('body').text().length,
            imageCount: $('img').length,
            linkCount: $('a[href]').length,
            metaRobots: $('meta[name="robots"]').attr('content') || '',
            canonicalUrl: $('link[rel="canonical"]').attr('href') || '',
            ogTitle: $('meta[property="og:title"]').attr('content') || '',
            ogDescription: $('meta[property="og:description"]').attr('content') || '',
        }
        return data
    }

    /**
     * Discover links on page
     */
    async discoverLinks($, currentUrl, currentDepth) {
        if (!this.config.linkSelector || currentDepth >= this.config.maxCrawlingDepth) {
            return []
        }

        const links = []
        $(this.config.linkSelector).each((_, element) => {
            try {
                const href = $(element).attr('href')
                if (!href) return

                // Resolve relative URLs
                const absoluteUrl = new URL(href, currentUrl).href

                // Only follow HTTP(S) links
                if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
                    return
                }

                // Check same domain (optional, can be configured)
                if (!isSameDomain(absoluteUrl, currentUrl)) {
                    return
                }

                // Normalize and deduplicate
                const normalizedUrl = normalizeUrl(absoluteUrl)
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

    /**
     * Process a single page
     */
    async processPage(url, depth) {
        if (this.config.debugLog) {
            await cafesdk.log.debug(`Processing: ${url} (depth: ${depth})`)
        }

        try {
            // Fetch page
            const { html, headers } = await this.fetchPage(url)

            // Parse with Cheerio
            const $ = cheerio.load(html)

            // Extract data
            const data = await this.extractData($, url)
            data.depth = depth
            data.statusCode = 200
            data.success = true

            // Discover new links
            const newLinks = await this.discoverLinks($, url, depth)

            // Add new links to queue
            for (const link of newLinks) {
                this.queue.push(link)
            }

            data.linksFound = newLinks.length

            return data

        } catch (error) {
            await cafesdk.log.error(`Failed to process ${url}: ${error.message}`)
            return {
                url: url,
                depth: depth,
                success: false,
                error: error.message
            }
        }
    }

    /**
     * Delay helper
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms))
    }

    /**
     * Run the scraper
     */
    async run(startUrls) {
        if (!startUrls || startUrls.length === 0) {
            throw new Error('No start URLs provided')
        }

        // Initialize queue
        for (const url of startUrls) {
            this.queue.push({ url, depth: 0 })
            this.visitedUrls.add(url)
        }

        await cafesdk.log.info(`Starting Cheerio Scraper with ${startUrls.length} start URLs`)
        await cafesdk.log.info(`Config: maxDepth=${this.config.maxCrawlingDepth}, maxPages=${this.config.maxPagesPerCrawl}, concurrency=${this.config.maxConcurrency}`)

        // Set table headers
        const headers = [
            { label: 'URL', key: 'url', format: 'text' },
            { label: 'Title', key: 'title', format: 'text' },
            { label: 'Description', key: 'description', format: 'text' },
            { label: 'Depth', key: 'depth', format: 'text' },
            { label: 'Status', key: 'success', format: 'text' },
            { label: 'Links Found', key: 'linksFound', format: 'text' }
        ]
        await cafesdk.result.setTableHeader(headers)

        // Process queue with concurrency control
        const processingPromises = []

        while (this.queue.length > 0 || this.activeRequests > 0) {
            // Check page limit
            if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                await cafesdk.log.info(`Reached max pages limit: ${this.config.maxPagesPerCrawl}`)
                break
            }

            // Start new requests if we have capacity
            while (this.queue.length > 0 && this.activeRequests < this.config.maxConcurrency) {
                if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                    break
                }

                const { url, depth } = this.queue.shift()
                
                // Check depth limit
                if (depth > this.config.maxCrawlingDepth) {
                    continue
                }

                this.activeRequests++
                this.pagesProcessed++

                const promise = (async () => {
                    try {
                        // Add delay between requests
                        if (this.config.requestDelayMs > 0) {
                            await this.delay(this.config.requestDelayMs)
                        }

                        const result = await this.processPage(url, depth)
                        
                        if (result.success) {
                            await cafesdk.result.pushData(result)
                        } else {
                            await cafesdk.result.pushData(result)
                        }
                    } finally {
                        this.activeRequests--
                    }
                })()

                processingPromises.push(promise)
            }

            // Wait a bit before next iteration
            if (this.activeRequests >= this.config.maxConcurrency) {
                await this.delay(100)
            }
        }

        // Wait for all remaining requests to complete
        await Promise.all(processingPromises)

        await cafesdk.log.info(`Scraping complete. Total pages processed: ${this.pagesProcessed}`)
    }
}

/**
 * Main function
 */
async function main() {
    try {
        await cafesdk.log.info('Cheerio Scraper Worker started')

        // Get input
        const input = await cafesdk.parameter.getInputJSONObject()
        await cafesdk.log.debug(`Input: ${JSON.stringify(input)}`)

        // Create scraper instance
        const scraper = new CheerioScraper(input)

        // Parse start URLs
        const startUrls = scraper.parseStartUrls(input)

        // Run scraper
        await scraper.run(startUrls)

        await cafesdk.log.info('Cheerio Scraper Worker finished successfully')

    } catch (error) {
        await cafesdk.log.error(`Script error: ${error.message}`)
        await cafesdk.result.pushData({
            error: error.message,
            status: 'error'
        })
        throw error
    }
}

// Run
main()
