<h1 align="center">⚡ Cheerio Scraper Worker</h1>

<p align="center">
  <strong>Lightweight HTTP-based web scraper | 轻量级 HTTP 网页爬虫</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#usage">Usage</a> •
  <a href="#comparison">Comparison</a> •
  <a href="#功能特性">中文文档</a>
</p>

---

## 🇺🇸 English

### Overview

A fast, lightweight web scraper that uses HTTP requests and Cheerio for HTML parsing. No browser required - perfect for static websites where JavaScript rendering is not needed.

**10-50x faster** than browser-based scrapers!

Perfect for:
- 📊 **Static Websites** - Blogs, news sites, documentation
- 🔍 **SEO Audits** - Quick metadata extraction
- 📈 **Price Monitoring** - E-commerce product pages
- 🗂️ **Content Aggregation** - RSS-like content collection

### Features

| Feature | Description |
|---------|-------------|
| ⚡ **Ultra Fast** | HTTP-only, no browser overhead |
| 💰 **Low Resource** | Minimal CPU and memory usage |
| 🔗 **Link Discovery** | Automatic same-domain link following |
| 📏 **Depth Control** | Configurable crawl depth |
| 🔄 **Concurrent** | Parallel request processing |
| 🔁 **Auto Retry** | Built-in retry for failed requests |
| 📊 **Rich Extraction** | Title, meta, headings, OG tags |

### Usage

1. **Add URLs** - Enter starting URLs
2. **Configure** - Set depth, limits, and selectors
3. **Run** - Start fast HTTP crawling
4. **Export** - Get structured data

### Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `startUrls` | array | - | Starting URLs |
| `linkSelector` | string | `a[href]` | CSS selector for links |
| `maxCrawlingDepth` | integer | 1 | Maximum crawl depth |
| `maxPagesPerCrawl` | integer | 100 | Maximum pages (0 = unlimited) |
| `maxConcurrency` | integer | 10 | Concurrent requests |
| `requestTimeoutSecs` | integer | 30 | Request timeout |
| `maxRequestRetries` | integer | 3 | Retry attempts |
| `ignoreSslErrors` | boolean | true | Ignore SSL errors |
| `userAgent` | string | Chrome UA | Custom User-Agent |
| `requestDelayMs` | integer | 500 | Delay between requests |
| `debugLog` | boolean | false | Debug logging |

### Output Example

```json
{
  "url": "https://example.com/page",
  "title": "Page Title",
  "description": "Meta description...",
  "keywords": "keyword1, keyword2",
  "h1": "Main Heading",
  "h2List": ["Subheading 1", "Subheading 2"],
  "textLength": 5000,
  "imageCount": 12,
  "linkCount": 45,
  "depth": 1,
  "success": true
}
```

---

## 🇨🇳 中文

### 概述

快速、轻量级的网页爬虫，使用 HTTP 请求和 Cheerio 解析 HTML。无需浏览器 - 非常适合不需要 JavaScript 渲染的静态网站。

**比浏览器爬虫快 10-50 倍！**

适用场景：
- 📊 **静态网站** - 博客、新闻网站、文档
- 🔍 **SEO 审计** - 快速提取元数据
- 📈 **价格监控** - 电商产品页面
- 🗂️ **内容聚合** - 类 RSS 的内容收集

### 功能特性

| 功能 | 描述 |
|------|------|
| ⚡ **超快速** | 仅 HTTP，无浏览器开销 |
| 💰 **低资源** | 最小 CPU 和内存占用 |
| 🔗 **链接发现** | 自动跟踪同域链接 |
| 📏 **深度控制** | 可配置爬取深度 |
| 🔄 **并发处理** | 并行请求处理 |
| 🔁 **自动重试** | 失败请求内置重试 |
| 📊 **丰富提取** | 标题、元数据、标题、OG 标签 |

### 配置参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `startUrls` | array | - | 起始 URL |
| `linkSelector` | string | `a[href]` | 链接 CSS 选择器 |
| `maxCrawlingDepth` | integer | 1 | 最大爬取深度 |
| `maxPagesPerCrawl` | integer | 100 | 最大页面数（0 = 不限制） |
| `maxConcurrency` | integer | 10 | 并发请求数 |
| `requestTimeoutSecs` | integer | 30 | 请求超时 |
| `maxRequestRetries` | integer | 3 | 重试次数 |
| `ignoreSslErrors` | boolean | true | 忽略 SSL 错误 |
| `userAgent` | string | Chrome UA | 自定义 User-Agent |
| `requestDelayMs` | integer | 500 | 请求间隔 |
| `debugLog` | boolean | false | 调试日志 |

---

## 📊 Comparison | 对比

| Feature | Cheerio Scraper | Web Scraper (Puppeteer) |
|---------|----------------|------------------------|
| Speed | ⚡⚡⚡⚡⚡ | ⚡⚡ |
| Memory | 💾 Low | 💾💾💾 High |
| JavaScript | ❌ No | ✅ Yes |
| Anti-bot | 🟡 Medium | 🟢 Better |
| Cost | 💰 Low | 💰💰 Higher |

**Choose Cheerio Scraper when:**
- Target site is static (no JS rendering needed)
- Speed and efficiency are priorities
- Running on limited resources

**Choose Web Scraper when:**
- Target site requires JavaScript
- Need to interact with page elements
- Anti-bot protection is aggressive

---

## ⚠️ Limitations | 限制

- ❌ Cannot execute JavaScript
- ❌ Cannot handle SPAs (Single Page Applications)
- ❌ Cannot interact with page elements
- ❌ May be blocked by some anti-bot systems

---

## 🔧 Technical Details | 技术细节

| Item | Value |
|------|-------|
| Platform | CafeScraper |
| HTTP Engine | Node.js fetch |
| HTML Parser | Cheerio |
| Runtime | Node.js 18+ |
| Dependencies | cheerio, grpc |

---

## 📝 Changelog | 更新日志

### v1.0.0 (2024-01)
- ✅ Initial release | 初始版本
- ✅ HTTP-based crawling | 基于 HTTP 的爬取
- ✅ Cheerio HTML parsing | Cheerio HTML 解析
- ✅ Concurrent requests | 并发请求
- ✅ Auto retry | 自动重试

---

<p align="center">
  <sub>Built with ⚡ for speed | 为速度而生</sub>
</p>
