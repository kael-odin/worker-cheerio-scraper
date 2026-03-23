<p align="center">
  <h1 align="center">🕷️ Cheerio Scraper Worker</h1>
  <p align="center">
    <b>快速网页爬虫 - 基于 Cheerio 的 HTML 解析</b><br>
    <i>Fast Web Scraper with Cheerio HTML Parsing</i>
  </p>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-CafeScraper-blue" alt="Platform">
  <img src="https://img.shields.io/badge/Node.js-18+-green" alt="Node.js">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## 📖 简介 | Introduction

**中文**：Cheerio Scraper 是一个快速、轻量级的网页爬虫，使用 Cheerio 库进行 HTML 解析。通过 CDP 连接远程浏览器，自动处理代理，无需额外配置。

**English**: Cheerio Scraper is a fast, lightweight web scraper using Cheerio for HTML parsing. Connects to remote browser via CDP with automatic proxy handling.

---

## ✨ 特性 | Features

| 特性 | 说明 |
|------|------|
| 🚀 **快速解析** | 使用 Cheerio 进行 HTML 解析，比浏览器渲染快 10-50 倍 |
| 🔗 **链接发现** | 自动发现并跟踪页面链接 |
| 📊 **深度控制** | 支持设置爬取深度限制 |
| 🎯 **模式匹配** | 支持 Glob 模式和正则表达式过滤 URL |
| ⚡ **并发控制** | 可配置并发请求数量 |
| 🔒 **自动代理** | CDP 浏览器自动处理代理，无需手动配置 |

---

## 🚀 快速开始 | Quick Start

### 基本配置 | Basic Configuration

```json
{
  "startUrls": [{ "url": "https://example.com" }],
  "linkSelector": "a[href]",
  "maxCrawlingDepth": 2,
  "maxPagesPerCrawl": 100
}
```

### 参数说明 | Parameters

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `startUrls` | array | - | 起始 URL 列表 |
| `linkSelector` | string | `a[href]` | 链接选择器 |
| `globPatterns` | array | `[]` | URL 匹配模式 |
| `excludePatterns` | array | `[]` | 排除 URL 模式 |
| `maxCrawlingDepth` | integer | 1 | 最大爬取深度 |
| `maxPagesPerCrawl` | integer | 100 | 最大页面数 |
| `maxConcurrency` | integer | 10 | 最大并发数 |
| `pageLoadTimeoutSecs` | integer | 60 | 页面超时（秒）|
| `maxRequestRetries` | integer | 3 | 重试次数 |
| `debugLog` | boolean | false | 调试日志 |

---

## 📝 使用示例 | Examples

### 示例 1：基础爬取

```json
{
  "startUrls": [{ "url": "https://example.com" }],
  "maxCrawlingDepth": 1,
  "maxPagesPerCrawl": 10
}
```

### 示例 2：带过滤的深度爬取

```json
{
  "startUrls": [{ "url": "https://example.com/blog" }],
  "linkSelector": "a[href]",
  "globPatterns": ["https://example.com/blog/*"],
  "excludePatterns": ["/tag/", "/author/", "*.pdf"],
  "maxCrawlingDepth": 3,
  "maxPagesPerCrawl": 50
}
```

### 示例 3：单页面抓取（不跟踪链接）

```json
{
  "startUrls": [
    { "url": "https://example1.com" },
    { "url": "https://example2.com" }
  ],
  "linkSelector": "",
  "maxCrawlingDepth": 0
}
```

---

## 📤 输出格式 | Output Format

每个爬取的页面将输出以下字段：

| 字段 | 说明 |
|------|------|
| `url` | 页面 URL |
| `title` | 页面标题 |
| `description` | Meta description |
| `h1` | 第一个 H1 标签 |
| `textContent` | 页面文本内容（前 1000 字符）|
| `linkCount` | 页面链接数量 |
| `imageCount` | 页面图片数量 |
| `depth` | 爬取深度 |
| `statusCode` | HTTP 状态码 |
| `linksFound` | 发现的链接数量 |

---

## ⚠️ 注意事项 | Notes

1. **代理自动处理**：CDP 浏览器自动使用平台代理，无需手动配置
2. **资源优化**：自动阻止图片、CSS、字体等资源加载，提高速度
3. **URL 去重**：自动对 URL 进行标准化和去重
4. **错误处理**：失败请求会自动重试

---

## 🔧 技术架构 | Architecture

```
┌─────────────────────────────────────────┐
│           Cheerio Scraper Worker         │
├─────────────────────────────────────────┤
│  ┌─────────────┐    ┌────────────────┐  │
│  │   Input     │───▶│  CDP Browser   │  │
│  │  Parameters │    │  (Puppeteer)   │  │
│  └─────────────┘    └───────┬────────┘  │
│                             │            │
│                     ┌───────▼────────┐  │
│                     │  Cheerio HTML  │  │
│                     │    Parser      │  │
│                     └───────┬────────┘  │
│                             │            │
│                     ┌───────▼────────┐  │
│                     │  Result Push   │  │
│                     │   (gRPC SDK)   │  │
│                     └────────────────┘  │
└─────────────────────────────────────────┘
```

---

## 📚 相关资源 | Resources

- [CafeScraper 文档](https://docs.cafescraper.com)
- [Cheerio 文档](https://cheerio.js.org)
- [Puppeteer 文档](https://pptr.dev)

---

## 📜 License

MIT License
