<h1 align="center">⚡ HTML Scraper</h1>

<p align="center">
  <strong>Fast & Lightweight Web Scraper | 快速轻量网页爬虫</strong>
</p>

<p align="center">
  <em>No browser needed — 10-50x faster than Puppeteer!</em>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#use-cases">Use Cases</a> •
  <a href="#usage">Usage</a> •
  <a href="#comparison">Comparison</a> •
  <a href="#功能特性">中文文档</a>
</p>

---

## 🇺🇸 English

### What is HTML Scraper?

A **blazing fast** web scraper that uses HTTP requests instead of a browser. Perfect for static websites, blogs, documentation, and any site that doesn't require JavaScript rendering.

**Why choose HTML Scraper?**
- ⚡ **10-50x faster** than browser-based scrapers
- 💰 **Lower costs** — minimal CPU and memory usage
- 🚀 **Higher concurrency** — process hundreds of pages per minute
- 🎯 **Simple & reliable** — no browser crashes or memory leaks

### Features

| Feature | Description |
|---------|-------------|
| ⚡ **Ultra Fast** | HTTP-only, no browser overhead |
| 💰 **Cost Efficient** | 90% less memory than browser scrapers |
| 🔗 **Smart Crawling** | Auto-discover links within domain |
| 📏 **Depth Control** | Limit how deep to crawl |
| 🚫 **URL Filtering** | Exclude unwanted URL patterns |
| 🌐 **Cross-Domain** | Option to follow external links |
| 🔄 **Auto Retry** | Built-in retry for failed requests |
| 📊 **Rich Data** | Title, meta tags, headings, OG tags |

### Use Cases

✅ **Perfect For:**
- 📰 Blogs, news sites, articles
- 📚 Documentation websites
- 🛒 E-commerce product pages
- 📊 SEO audits and analysis
- 🗂️ Content aggregation
- 📈 Price monitoring

❌ **Not Suitable For:**
- Single Page Applications (SPA)
- Sites requiring JavaScript rendering
- Dynamic content loaded via AJAX
- Sites with heavy anti-bot protection

### Usage

1. **Enter URLs** — Add starting URLs to crawl
2. **Configure** — Set depth, limits, and filters
3. **Run** — Start fast HTTP crawling
4. **Download** — Export results as JSON/CSV

### Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `startUrls` | - | Starting URLs to crawl |
| `linkSelector` | `a[href]` | CSS selector for finding links |
| `excludePatterns` | - | URL patterns to skip |
| `maxCrawlingDepth` | 1 | Maximum crawl depth |
| `maxPagesPerCrawl` | 100 | Maximum pages (0 = unlimited) |
| `maxConcurrency` | 10 | Concurrent requests |
| `requestTimeoutSecs` | 30 | Request timeout |
| `maxRequestRetries` | 2 | Retry attempts |
| `requestDelayMs` | 500 | Delay between requests |
| `crossDomain` | false | Allow crawling other domains |

### Output Example

```json
{
  "url": "https://example.com/article",
  "title": "Article Title",
  "description": "Meta description...",
  "keywords": "keyword1, keyword2",
  "h1": "Main Heading",
  "h2List": ["Section 1", "Section 2"],
  "textLength": 5000,
  "imageCount": 12,
  "linkCount": 45,
  "depth": 1,
  "statusCode": 200,
  "ogTitle": "Open Graph Title",
  "ogDescription": "OG Description"
}
```

---

## 🇨🇳 中文

### 什么是 HTML Scraper？

一款**极速**网页爬虫，使用 HTTP 请求而非浏览器。非常适合静态网站、博客、文档以及任何不需要 JavaScript 渲染的网站。

**为什么选择 HTML Scraper？**
- ⚡ **比浏览器爬虫快 10-50 倍**
- 💰 **更低成本** — CPU 和内存占用极低
- 🚀 **更高并发** — 每分钟处理数百个页面
- 🎯 **简单可靠** — 无浏览器崩溃或内存泄漏

### 功能特性

| 功能 | 描述 |
|------|------|
| ⚡ **超快速** | 仅 HTTP，无浏览器开销 |
| 💰 **高效省钱** | 内存占用比浏览器爬虫低 90% |
| 🔗 **智能爬取** | 自动发现同域链接 |
| 📏 **深度控制** | 限制爬取深度 |
| 🚫 **URL 过滤** | 排除不需要的 URL 模式 |
| 🌐 **跨域选项** | 可选跟踪外部链接 |
| 🔄 **自动重试** | 失败请求内置重试 |
| 📊 **丰富数据** | 标题、元标签、标题、OG 标签 |

### 适用场景

✅ **适合：**
- 📰 博客、新闻网站、文章
- 📚 文档网站
- 🛒 电商产品页面
- 📊 SEO 审计分析
- 🗂️ 内容聚合
- 📈 价格监控

❌ **不适合：**
- 单页应用 (SPA)
- 需要 JavaScript 渲染的网站
- 通过 AJAX 加载的动态内容
- 有强力反爬保护的网站

### 配置参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `startUrls` | - | 起始 URL |
| `linkSelector` | `a[href]` | 链接 CSS 选择器 |
| `excludePatterns` | - | 要排除的 URL 模式 |
| `maxCrawlingDepth` | 1 | 最大爬取深度 |
| `maxPagesPerCrawl` | 100 | 最大页面数（0 = 不限制） |
| `maxConcurrency` | 10 | 并发请求数 |
| `requestTimeoutSecs` | 30 | 请求超时 |
| `maxRequestRetries` | 2 | 重试次数 |
| `requestDelayMs` | 500 | 请求间隔 |
| `crossDomain` | false | 允许跨域爬取 |

---

## 📊 Comparison | 对比

| Feature | HTML Scraper | Web Scraper (Browser) |
|---------|--------------|----------------------|
| **Speed** | ⚡⚡⚡⚡⚡ 10-50x faster | ⚡⚡ Base speed |
| **Memory** | 💾 ~50MB | 💾💾💾 ~500MB+ |
| **JavaScript** | ❌ Not supported | ✅ Full support |
| **Concurrency** | 🟢 High (50+) | 🟡 Limited (5-10) |
| **Anti-bot** | 🟡 Basic evasion | 🟢 Better evasion |
| **Cost** | 💰 Low | 💰💰 Higher |
| **Stability** | 🟢 Very stable | 🟡 May crash |

### When to Use Which?

**Choose HTML Scraper when:**
- ✅ Target site is static (no JS needed)
- ✅ Speed and efficiency are priorities
- ✅ Running large-scale crawls
- ✅ Budget is limited

**Choose Web Scraper when:**
- ✅ Target site requires JavaScript
- ✅ Need to interact with page elements
- ✅ Strong anti-bot protection exists
- ✅ SPA or dynamic content

---

## ⚠️ Important Notes | 注意事项

### Excluding URLs

Use `excludePatterns` to skip unwanted URLs:
```
/login
/admin
.pdf$
/logout
```

### Rate Limiting

Set `requestDelayMs` to avoid being blocked:
- **Polite**: 1000ms (1 second)
- **Normal**: 500ms (default)
- **Aggressive**: 100ms (may trigger blocks)

### Cross-Domain Crawling

Enable `crossDomain: true` to follow external links. Use with caution as this may:
- Significantly increase pages crawled
- Lead to unrelated content
- Trigger anti-bot measures

---

## 🔧 Technical Details | 技术细节

| Item | Value |
|------|-------|
| Platform | CafeScraper |
| HTTP Engine | Node.js native fetch |
| HTML Parser | Cheerio |
| Runtime | Node.js 18+ |
| Memory | ~50MB typical |

---

## ❓ FAQ | 常见问题

<details>
<summary>Why is it so fast? | 为什么这么快？</summary>

HTML Scraper uses HTTP requests directly without loading a browser. No JavaScript execution, no rendering, no CSS — just raw HTML parsing. This eliminates 95% of the overhead.

HTML Scraper 直接使用 HTTP 请求，无需加载浏览器。不执行 JavaScript、不渲染、不处理 CSS — 只解析原始 HTML。这消除了 95% 的开销。

</details>

<details>
<summary>Can it scrape dynamic content? | 能爬取动态内容吗？</summary>

No. If the website loads content via JavaScript (React, Vue, Angular, etc.), use Web Scraper instead.

不能。如果网站通过 JavaScript 加载内容（React、Vue、Angular 等），请使用 Web Scraper。

</details>

<details>
<summary>How to avoid being blocked? | 如何避免被封？</summary>

1. Set `requestDelayMs` to 500-1000
2. Use `excludePatterns` to skip sensitive URLs
3. Limit `maxConcurrency` to 5-10
4. Don't enable cross-domain crawling

1. 设置 `requestDelayMs` 为 500-1000
2. 使用 `excludePatterns` 跳过敏感 URL
3. 限制 `maxConcurrency` 为 5-10
4. 不要启用跨域爬取

</details>

---

## 📝 Changelog | 更新日志

### v1.1.0 (Current)
- ✅ Renamed to HTML Scraper | 重命名为 HTML Scraper
- ✅ Added URL exclude patterns | 添加 URL 排除模式
- ✅ Added cross-domain option | 添加跨域选项
- ✅ Improved error handling | 改进错误处理
- ✅ Better logging | 更好的日志

### v1.0.0
- ✅ Initial release | 初始版本
- ✅ HTTP-based crawling | HTTP 爬取
- ✅ Cheerio HTML parsing | Cheerio 解析

---

<p align="center">
  <sub>Built with ⚡ for speed | 为速度而生</sub>
</p>
