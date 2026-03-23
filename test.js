#!/usr/bin/env node
'use strict'

/**
 * Local test script for Cheerio Scraper Worker
 * Runs without CafeScraper platform (standalone mode)
 */

const cheerio = require('cheerio')

// Test configuration
const TEST_CONFIG = {
    startUrls: [
        { url: 'https://httpbin.org/html' },
        { url: 'https://www.iana.org/domains/reserved' }
    ],
    linkSelector: 'a[href]',
    maxCrawlingDepth: 2,
    maxPagesPerCrawl: 10,
    maxConcurrency: 2,
    requestTimeoutSecs: 30,
    maxRequestRetries: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    requestDelayMs: 500,
    debugLog: true
}

// Results storage
const results = []

// Logging
const log = {
    info: (...args) => console.log('[INFO]', ...args),
    error: (...args) => console.error('[ERROR]', ...args),
    warn: (...args) => console.warn('[WARN]', ...args),
    debug: (...args) => TEST_CONFIG.debugLog && console.log('[DEBUG]', ...args)
}

/**
 * URL normalization
 */
function normalizeUrl(url) {
    try {
        const parsed = new URL(url)
        let path = parsed.pathname
        if (path.endsWith('/') && path.length > 1) {
            path = path.slice(0, -1)
        }
        return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`
    } catch {
        return url.replace(/\/$/, '')
    }
}

/**
 * Check same domain
 */
function isSameDomain(url1, url2) {
    try {
        return new URL(url1).hostname === new URL(url2).hostname
    } catch {
        return false
    }
}

/**
 * Delay helper
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Fetch page with timeout and retries
 */
async function fetchPage(url, timeoutSecs = 30, retries = 2) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutSecs * 1000)

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': TEST_CONFIG.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                },
                signal: controller.signal
            })

            clearTimeout(timeoutId)

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`)
            }

            return await response.text()
        } catch (error) {
            if (attempt === retries) {
                clearTimeout(timeoutId)
                throw error
            }
            log.debug(`Retry ${attempt + 1}/${retries} for ${url}`)
            await delay(1000)
        }
    }
}

/**
 * Extract data from HTML
 */
function extractData($, url) {
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
        ogTitle: $('meta[property="og:title"]').attr('content') || '',
    }
}

/**
 * Discover links
 */
function discoverLinks($, currentUrl, visitedUrls, maxLinks = 20) {
    const links = []
    const currentHost = new URL(currentUrl).hostname
    
    $('a[href]').each((_, element) => {
        if (links.length >= maxLinks) return false
        
        try {
            const href = $(element).attr('href')
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

            const absoluteUrl = new URL(href, currentUrl).href

            if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
                return
            }

            const targetHost = new URL(absoluteUrl).hostname
            if (targetHost !== currentHost) {
                return
            }

            const normalizedUrl = normalizeUrl(absoluteUrl)
            if (!visitedUrls.has(normalizedUrl)) {
                links.push(normalizedUrl)
                visitedUrls.add(normalizedUrl)
            }
        } catch (e) {
            // Skip invalid URLs
        }
    })

    return links
}

/**
 * Process a single page
 */
async function processPage(url, depth, visitedUrls, queue) {
    log.info(`Processing: ${url} (depth: ${depth})`)

    try {
        const html = await fetchPage(url)
        const $ = cheerio.load(html)

        // Extract data
        const data = extractData($, url)
        data.depth = depth
        data.success = true
        data.linksFound = 0

        // Discover links if depth allows
        if (depth < TEST_CONFIG.maxCrawlingDepth && TEST_CONFIG.linkSelector) {
            const newLinks = discoverLinks($, url, visitedUrls)
            for (const link of newLinks) {
                queue.push({ url: link, depth: depth + 1 })
            }
            data.linksFound = newLinks.length
            if (newLinks.length > 0) {
                log.debug(`Found ${newLinks.length} new links`)
            }
        }

        return data

    } catch (error) {
        log.error(`Failed: ${url} - ${error.message}`)
        return {
            url: url,
            depth: depth,
            success: false,
            error: error.message
        }
    }
}

/**
 * Main test function
 */
async function runTest() {
    console.log('\n' + '='.repeat(60))
    console.log('Cheerio Scraper Worker - Local Test')
    console.log('='.repeat(60))
    console.log('\nConfiguration:')
    console.log(`  Start URLs: ${TEST_CONFIG.startUrls.map(u => u.url).join(', ')}`)
    console.log(`  Max Depth: ${TEST_CONFIG.maxCrawlingDepth}`)
    console.log(`  Max Pages: ${TEST_CONFIG.maxPagesPerCrawl}`)
    console.log(`  Concurrency: ${TEST_CONFIG.maxConcurrency}`)
    console.log(`  Request Delay: ${TEST_CONFIG.requestDelayMs}ms`)
    console.log('')

    const visitedUrls = new Set()
    const queue = []
    let pagesProcessed = 0
    const startTime = Date.now()

    // Initialize queue
    for (const item of TEST_CONFIG.startUrls) {
        const url = normalizeUrl(item.url)
        queue.push({ url, depth: 0 })
        visitedUrls.add(url)
    }

    // Process queue
    while (queue.length > 0 && pagesProcessed < TEST_CONFIG.maxPagesPerCrawl) {
        const { url, depth } = queue.shift()

        if (depth > TEST_CONFIG.maxCrawlingDepth) {
            continue
        }

        // Add delay between requests
        if (TEST_CONFIG.requestDelayMs > 0 && pagesProcessed > 0) {
            await delay(TEST_CONFIG.requestDelayMs)
        }

        const result = await processPage(url, depth, visitedUrls, queue)
        results.push(result)
        pagesProcessed++

        // Print result summary
        const status = result.success ? '✓' : '✗'
        console.log(`  ${status} [${result.depth}] ${result.url}`)
        if (result.success) {
            console.log(`      Title: ${result.title.substring(0, 50)}${result.title.length > 50 ? '...' : ''}`)
            console.log(`      Links found: ${result.linksFound}`)
        }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('Test Complete!')
    console.log('='.repeat(60))
    console.log(`\nDuration: ${duration}s`)
    console.log(`Total pages: ${pagesProcessed}`)
    console.log(`Successful: ${results.filter(r => r.success).length}`)
    console.log(`Failed: ${results.filter(r => !r.success).length}`)
    
    // Performance metrics
    const avgTime = (duration / pagesProcessed).toFixed(2)
    console.log(`Avg time per page: ${avgTime}s`)
    
    // Show failed URLs
    const failed = results.filter(r => !r.success)
    if (failed.length > 0) {
        console.log('\nFailed URLs:')
        failed.forEach(r => console.log(`  - ${r.url}: ${r.error}`))
    }

    console.log('\n' + '-'.repeat(60))
    console.log('Detailed Results:')
    console.log('-'.repeat(60))
    results.forEach((r, i) => {
        console.log(`\n[${i + 1}] ${r.url}`)
        if (r.success) {
            console.log(`    Title: ${r.title}`)
            console.log(`    H1: ${r.h1}`)
            console.log(`    Text Length: ${r.textLength}`)
            console.log(`    Images: ${r.imageCount}, Links: ${r.linkCount}`)
        } else {
            console.log(`    Error: ${r.error}`)
        }
    })
}

// Run test
runTest().catch(error => {
    console.error('Test failed:', error)
    process.exit(1)
})
