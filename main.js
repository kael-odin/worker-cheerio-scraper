#!/usr/bin/env node
'use strict'

const cafesdk = require('./sdk')
const cheerio = require('cheerio')
const http = require('http')
const https = require('https')
const zlib = require('zlib')
const { promisify } = require('util')

const gunzip = promisify(zlib.gunzip)
const inflate = promisify(zlib.inflate)
const brotliDecompress = promisify(zlib.brotliDecompress)

/**
 * HTML Scraper Worker (formerly Cheerio Scraper)
 * 
 * A fast, lightweight web scraper using HTTP requests and Cheerio.
 * No browser needed - 10-50x faster than browser-based scrapers!
 * 
 * Features:
 * - HTTP-based crawling (no browser overhead)
 * - Fast HTML parsing with Cheerio
 * - Link discovery and depth control
 * - URL exclusion patterns
 * - Cross-domain option
 * - Concurrent requests with rate limiting
 * - CafeScraper proxy support (HTTP CONNECT)
 */

// Default configuration
const DEFAULT_CONFIG = {
    maxCrawlingDepth: 1,
    maxPagesPerCrawl: 100,
    maxConcurrency: 10,
    requestTimeoutSecs: 30,
    maxRequestRetries: 2,
    linkSelector: 'a[href]',
    excludePatterns: [],
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    requestDelayMs: 500,
    crossDomain: false,
    debugLog: false
}

/**
 * URL normalization to prevent duplicates
 */
function normalizeUrl(url) {
    try {
        const parsed = new URL(url)
        let path = parsed.pathname
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1)
        }
        const port = parsed.port
        const defaultPorts = { 'http:': '80', 'https:': '443' }
        const host = port && defaultPorts[parsed.protocol] === port
            ? parsed.hostname
            : parsed.host
        return `${parsed.protocol}//${host}${path}${parsed.search}`
    } catch {
        return url.replace(/\/$/, '')
    }
}

/**
 * Check if URL matches any exclude pattern
 */
function shouldExclude(url, patterns) {
    if (!patterns || patterns.length === 0) return false
    const urlLower = url.toLowerCase()
    return patterns.some(pattern => {
        const p = pattern.toLowerCase()
        if (p.includes('*')) {
            const regex = new RegExp(p.replace(/\*/g, '.*'), 'i')
            return regex.test(url)
        }
        return urlLower.includes(p)
    })
}

/**
 * Check if URL belongs to same domain
 */
function isSameDomain(url1, url2) {
    try {
        return new URL(url1).hostname === new URL(url2).hostname
    } catch {
        return false
    }
}

/**
 * Extract domain from URL
 */
function getDomain(url) {
    try {
        return new URL(url).hostname
    } catch {
        return ''
    }
}

class HTMLScraper {
    constructor(config) {
        this.config = { ...DEFAULT_CONFIG, ...config }
        this.visitedUrls = new Set()
        this.queue = []
        this.pagesProcessed = 0
        this.successCount = 0
        this.failCount = 0
        this.activeRequests = 0
        this.startDomain = ''
        this.proxyAuth = null
    }

    /**
     * Initialize proxy for CafeScraper platform
     */
    async initProxy() {
        this.proxyAuth = process.env.PROXY_AUTH || null
        if (this.proxyAuth) {
            await cafesdk.log.info('Proxy enabled (HTTP CONNECT)')
        } else {
            await cafesdk.log.info('No proxy configured, using direct connection')
        }
    }

    /**
     * Parse input URLs (supports multiple formats)
     */
    parseStartUrls(input) {
        const urls = []
        
        // Support 'url' field
        if (input.url) {
            if (Array.isArray(input.url)) {
                for (const item of input.url) {
                    if (typeof item === 'string') {
                        urls.push(normalizeUrl(item.trim()))
                    } else if (item && item.url) {
                        urls.push(normalizeUrl(item.url.trim()))
                    }
                }
            } else if (typeof input.url === 'string') {
                urls.push(normalizeUrl(input.url.trim()))
            } else if (typeof input.url === 'object' && input.url.url) {
                urls.push(normalizeUrl(input.url.url.trim()))
            }
        }
        
        // Support 'startUrls' field
        if (input.startUrls) {
            if (Array.isArray(input.startUrls)) {
                for (const item of input.startUrls) {
                    if (typeof item === 'string') {
                        urls.push(normalizeUrl(item.trim()))
                    } else if (item && item.url) {
                        urls.push(normalizeUrl(item.url.trim()))
                    }
                }
            } else if (typeof input.startUrls === 'string') {
                urls.push(normalizeUrl(input.startUrls.trim()))
            } else if (typeof input.startUrls === 'object' && input.startUrls.url) {
                urls.push(normalizeUrl(input.startUrls.url.trim()))
            }
        }
        
        return urls.filter(url => url && url.length > 0)
    }

    /**
     * Parse exclude patterns
     */
    parseExcludePatterns(input) {
        if (!input.excludePatterns) return []
        if (Array.isArray(input.excludePatterns)) {
            return input.excludePatterns
                .map(p => typeof p === 'string' ? p.trim() : (p && (p.string || p.url || '')))
                .filter(Boolean)
        }
        return []
    }

    /**
     * Fetch a page using HTTP CONNECT proxy (CafeScraper compatible)
     */
    async fetchPage(url, retries = 0) {
        const timeout = this.config.requestTimeoutSecs * 1000
        const proxyHost = 'proxy-inner.cafescraper.com'
        const proxyPort = 6000

        const requestHeaders = {
            'User-Agent': this.config.userAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
        }

        return new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error(`Request timeout after ${timeout}ms`))
            }, timeout)

            const decompressResponse = async (buffer, encoding) => {
                try {
                    switch (encoding) {
                        case 'gzip':
                            return await gunzip(buffer)
                        case 'deflate':
                            return await inflate(buffer)
                        case 'br':
                            return await brotliDecompress(buffer)
                        default:
                            return buffer
                    }
                } catch (err) {
                    return buffer
                }
            }

            const handleResponse = async (response) => {
                clearTimeout(timeoutId)
                const chunks = []

                response.on('data', (chunk) => chunks.push(chunk))

                response.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks)
                        const encoding = response.headers['content-encoding']
                        const decompressed = await decompressResponse(buffer, encoding)
                        const html = decompressed.toString('utf8')

                        resolve({
                            html,
                            finalUrl: url,
                            statusCode: response.statusCode
                        })
                    } catch (e) {
                        reject(new Error(`Response processing error: ${e.message}`))
                    }
                })

                response.on('error', (err) => {
                    clearTimeout(timeoutId)
                    reject(err)
                })
            }

            const handleError = (err) => {
                clearTimeout(timeoutId)
                reject(err)
            }

            // Use proxy if available
            if (this.proxyAuth) {
                const req = http.request(
                    {
                        host: proxyHost,
                        port: proxyPort,
                        method: 'CONNECT',
                        path: url,
                        headers: {
                            Host: proxyHost,
                            'Proxy-Authorization': `Basic ${Buffer.from(this.proxyAuth).toString('base64')}`,
                        },
                    },
                    (res) => {
                        if (res.statusCode !== 200) {
                            clearTimeout(timeoutId)
                            reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`))
                            return
                        }

                        const targetUrl = new URL(url)
                        const protocol = targetUrl.protocol === 'https:' ? https : http
                        const requestOptions = {
                            protocol: targetUrl.protocol,
                            hostname: targetUrl.hostname,
                            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                            path: `${targetUrl.pathname}${targetUrl.search}`,
                            method: 'GET',
                            headers: requestHeaders,
                            socket: res.socket,
                        }

                        const request = protocol.request(requestOptions, handleResponse)
                        request.on('error', handleError)
                        request.end()
                    }
                )

                req.on('error', handleError)
                req.end()
            } else {
                // Direct connection (no proxy)
                const targetUrl = new URL(url)
                const protocol = targetUrl.protocol === 'https:' ? https : http
                
                const req = protocol.get(
                    url,
                    { headers: requestHeaders, timeout },
                    handleResponse
                )
                req.on('error', handleError)
                req.on('timeout', () => {
                    req.destroy()
                    reject(new Error('Request timeout'))
                })
            }
        })
    }

    /**
     * Fetch with retry logic
     */
    async fetchWithRetry(url, retries = 0) {
        try {
            return await this.fetchPage(url)
        } catch (error) {
            if (retries < this.config.maxRequestRetries) {
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Retrying ${url} (${retries + 2}/${this.config.maxRequestRetries + 1})`)
                }
                await this.delay(this.config.requestDelayMs * (retries + 1))
                return this.fetchWithRetry(url, retries + 1)
            }
            throw error
        }
    }

    /**
     * Extract data from HTML
     */
    async extractData($, url) {
        return {
            url: url,
            title: $('title').text().trim() || '',
            description: $('meta[name="description"]').attr('content') || '',
            keywords: $('meta[name="keywords"]').attr('content') || '',
            h1: $('h1').first().text().trim() || '',
            h2List: $('h2').slice(0, 5).map((_, el) => $(el).text().trim()).get().filter(Boolean),
            textLength: $('body').text().replace(/\s+/g, ' ').trim().length,
            imageCount: $('img').length,
            linkCount: $('a[href]').length,
            metaRobots: $('meta[name="robots"]').attr('content') || '',
            canonicalUrl: $('link[rel="canonical"]').attr('href') || '',
            ogTitle: $('meta[property="og:title"]').attr('content') || '',
            ogDescription: $('meta[property="og:description"]').attr('content') || '',
            ogImage: $('meta[property="og:image"]').attr('content') || '',
            language: $('html').attr('lang') || '',
        }
    }

    /**
     * Discover links on page
     */
    async discoverLinks($, currentUrl, currentDepth) {
        if (!this.config.linkSelector || currentDepth >= this.config.maxCrawlingDepth) {
            return []
        }

        const links = []
        const excludePatterns = this.parseExcludePatterns(this.config)

        $(this.config.linkSelector).each((_, element) => {
            try {
                const href = $(element).attr('href')
                if (!href) return

                if (href.startsWith('#') || href.startsWith('javascript:')) return

                const absoluteUrl = new URL(href, currentUrl).href

                if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
                    return
                }

                if (shouldExclude(absoluteUrl, excludePatterns)) {
                    return
                }

                const targetDomain = getDomain(absoluteUrl)
                if (!this.config.crossDomain && targetDomain !== this.startDomain) {
                    return
                }

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
            const excludePatterns = this.parseExcludePatterns(this.config)
            if (shouldExclude(url, excludePatterns)) {
                if (this.config.debugLog) {
                    await cafesdk.log.debug(`Skipping excluded URL: ${url}`)
                }
                return null
            }

            const { html, finalUrl, statusCode } = await this.fetchWithRetry(url)

            const $ = cheerio.load(html)

            const data = await this.extractData($, url)
            data.depth = depth
            data.statusCode = statusCode
            data.success = true

            const newLinks = await this.discoverLinks($, url, depth)

            for (const link of newLinks) {
                this.queue.push(link)
            }

            data.linksFound = newLinks.length

            return data

        } catch (error) {
            await cafesdk.log.error(`Failed: ${url} - ${error.message}`)
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

        // Initialize proxy
        await this.initProxy()

        this.startDomain = getDomain(startUrls[0])

        for (const url of startUrls) {
            this.queue.push({ url, depth: 0 })
            this.visitedUrls.add(url)
        }

        await cafesdk.log.info(`🚀 Starting HTML Scraper`)
        await cafesdk.log.info(`   URLs: ${startUrls.length} | Depth: ${this.config.maxCrawlingDepth} | Max Pages: ${this.config.maxPagesPerCrawl}`)
        await cafesdk.log.info(`   Domain: ${this.startDomain} | Cross-domain: ${this.config.crossDomain}`)

        const headers = [
            { label: 'URL', key: 'url', format: 'text' },
            { label: 'Title', key: 'title', format: 'text' },
            { label: 'Description', key: 'description', format: 'text' },
            { label: 'Depth', key: 'depth', format: 'text' },
            { label: 'Status', key: 'statusCode', format: 'text' },
            { label: 'Links', key: 'linksFound', format: 'text' }
        ]
        await cafesdk.result.setTableHeader(headers)

        const processingPromises = new Set()

        while (this.queue.length > 0 || this.activeRequests > 0) {
            if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                await cafesdk.log.info(`Reached max pages: ${this.config.maxPagesPerCrawl}`)
                break
            }

            while (this.queue.length > 0 && this.activeRequests < this.config.maxConcurrency) {
                if (this.config.maxPagesPerCrawl > 0 && this.pagesProcessed >= this.config.maxPagesPerCrawl) {
                    break
                }

                const { url, depth } = this.queue.shift()
                
                if (depth > this.config.maxCrawlingDepth) {
                    continue
                }

                this.activeRequests++
                this.pagesProcessed++

                const promise = (async () => {
                    try {
                        if (this.config.requestDelayMs > 0 && this.pagesProcessed > 1) {
                            await this.delay(this.config.requestDelayMs)
                        }

                        const result = await this.processPage(url, depth)
                        
                        if (result) {
                            await cafesdk.result.pushData(result)
                            if (result.success) {
                                this.successCount++
                            } else {
                                this.failCount++
                            }
                        }
                    } finally {
                        this.activeRequests--
                        processingPromises.delete(promise)
                    }
                })()

                processingPromises.add(promise)
            }

            if (this.activeRequests >= this.config.maxConcurrency || this.queue.length === 0) {
                await this.delay(50)
            }
        }

        await Promise.all(processingPromises)

        await cafesdk.log.info(`✅ Complete! Total: ${this.pagesProcessed} | Success: ${this.successCount} | Failed: ${this.failCount}`)
    }
}

/**
 * Main function
 */
async function main() {
    try {
        await cafesdk.log.info('HTML Scraper Worker started')

        const input = await cafesdk.parameter.getInputJSONObject()
        await cafesdk.log.debug(`Input: ${JSON.stringify(input)}`)

        const scraper = new HTMLScraper(input)
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

// Run
main()
