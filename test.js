#!/usr/bin/env node
'use strict'

const cheerio = require('cheerio')

// Test configuration
const TEST_CONFIG = {
    startUrls: [
        { url: 'https://httpbin.org/html' },
        { url: 'https://www.iana.org/domains/reserved' }
    ],
    linkSelector: 'a[href]',
    excludePatterns: [],
    maxCrawlingDepth: 2,
    maxPagesPerCrawl: 10,
    maxConcurrency: 3,
    requestTimeoutSecs: 30,
    maxRequestRetries: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    requestDelayMs: 300,
    crossDomain: false,
    debugLog: true
}

// Results
const results = []

// Logging
const log = {
    info: (...args) => console.log('ℹ️', ...args),
    error: (...args) => console.error('❌', ...args),
    warn: (...args) => console.warn('⚠️', ...args),
    debug: (...args) => TEST_CONFIG.debugLog && console.log('🔍', ...args)
}

function normalizeUrl(url) {
    try {
        const parsed = new URL(url)
        let path = parsed.pathname
        if (path.endsWith('/') && path.length > 1) path = path.slice(0, -1)
        return `${parsed.protocol}//${parsed.host}${path}${parsed.search}`
    } catch {
        return url.replace(/\/$/, '')
    }
}

function shouldExclude(url, patterns) {
    if (!patterns?.length) return false
    const urlLower = url.toLowerCase()
    return patterns.some(p => urlLower.includes(p.toLowerCase()))
}

function getDomain(url) {
    try { return new URL(url).hostname } catch { return '' }
}

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
}

// Fetch with retry
async function fetchPage(url, timeoutSecs = 30, retries = 2) {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), timeoutSecs * 1000)

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const response = await fetch(url, {
                headers: {
                    'User-Agent': TEST_CONFIG.userAgent,
                    'Accept': 'text/html,application/xhtml+xml',
                },
                signal: controller.signal
            })

            clearTimeout(timeoutId)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            return await response.text()
        } catch (error) {
            if (attempt === retries) {
                clearTimeout(timeoutId)
                throw error
            }
            log.debug(`Retry ${attempt + 1}/${retries} for ${url}`)
            await delay(500)
        }
    }
}

// Extract data
function extractData($, url) {
    return {
        url,
        title: $('title').text().trim() || '',
        description: $('meta[name="description"]').attr('content') || '',
        h1: $('h1').first().text().trim() || '',
        h2List: $('h2').slice(0, 5).map((_, el) => $(el).text().trim()).get().filter(Boolean),
        textLength: $('body').text().replace(/\s+/g, ' ').trim().length,
        imageCount: $('img').length,
        linkCount: $('a[href]').length,
    }
}

// Discover links
function discoverLinks($, currentUrl, visitedUrls, startDomain) {
    const links = []
    const currentDomain = getDomain(currentUrl)
    let foundCount = 0

    $('a[href]').each((_, el) => {
        try {
            const href = $(el).attr('href')
            if (!href || href.startsWith('#') || href.startsWith('javascript:')) return

            const absoluteUrl = new URL(href, currentUrl).href
            if (!absoluteUrl.startsWith('http')) return

            const targetDomain = getDomain(absoluteUrl)
            
            // Check cross-domain
            if (!TEST_CONFIG.crossDomain && targetDomain !== startDomain) {
                return
            }

            const normalizedUrl = normalizeUrl(absoluteUrl)
            if (!visitedUrls.has(normalizedUrl) && !shouldExclude(normalizedUrl, TEST_CONFIG.excludePatterns)) {
                links.push({ url: normalizedUrl, depth: 0 })
                visitedUrls.add(normalizedUrl)
                foundCount++
            }
        } catch (e) {}
    })

    log.debug(`Found ${foundCount} new links on ${currentUrl}`)
    return links
}

// Main test
async function runTest() {
    console.log('\n' + '='.repeat(60))
    console.log('⚡ HTML Scraper Worker - Local Test')
    console.log('='.repeat(60))
    console.log('\n📋 Configuration:')
    console.log(`   URLs: ${TEST_CONFIG.startUrls.length}`)
    console.log(`   Max Depth: ${TEST_CONFIG.maxCrawlingDepth}`)
    console.log(`   Max Pages: ${TEST_CONFIG.maxPagesPerCrawl}`)
    console.log(`   Concurrency: ${TEST_CONFIG.maxConcurrency}`)
    console.log('')

    const visitedUrls = new Set()
    const queue = []
    let pagesProcessed = 0
    let successCount = 0
    let failCount = 0

    const startDomain = getDomain(TEST_CONFIG.startUrls[0].url)
    console.log(`📍 Start domain: ${startDomain}\n`)

    // Initialize queue
    for (const item of TEST_CONFIG.startUrls) {
        const url = normalizeUrl(item.url)
        queue.push({ url, depth: 0 })
        visitedUrls.add(url)
    }

    const startTime = Date.now()

    // Process
    while (queue.length > 0 && pagesProcessed < TEST_CONFIG.maxPagesPerCrawl) {
        const { url, depth } = queue.shift()
        if (depth > TEST_CONFIG.maxCrawlingDepth) continue

        // Delay between requests
        if (pagesProcessed > 0 && TEST_CONFIG.requestDelayMs > 0) {
            await delay(TEST_CONFIG.requestDelayMs)
        }

        log.info(`[${depth}] ${url}`)

        try {
            const html = await fetchPage(url)
            const $ = cheerio.load(html)
            const data = extractData($, url)
            data.depth = depth
            data.success = true

            // Discover links
            const newLinks = discoverLinks($, url, visitedUrls, startDomain)
            for (const link of newLinks) {
                link.depth = depth + 1
                queue.push(link)
            }
            data.linksFound = newLinks.length

            results.push(data)
            successCount++
            console.log(`   ✅ Title: "${data.title.substring(0, 40)}${data.title.length > 40 ? '...' : ''}"`)
            console.log(`      Links: ${data.linksFound} | Text: ${data.textLength} chars`)

        } catch (error) {
            log.error(`${url}: ${error.message}`)
            results.push({ url, depth, success: false, error: error.message })
            failCount++
        }

        pagesProcessed++
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2)

    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('✅ Test Complete!')
    console.log('='.repeat(60))
    console.log(`\n📊 Results:`)
    console.log(`   Total: ${pagesProcessed} pages`)
    console.log(`   Successful: ${successCount} ✓`)
    console.log(`   Failed: ${failCount} ✗`)
    console.log(`   Time: ${duration}s (${(duration / pagesProcessed).toFixed(2)}s/page)`)
}

runTest().catch(console.error)
