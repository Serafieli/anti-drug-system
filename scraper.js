// antidrugsystem - Движок поискового парсинга и сбора контактов
const { saveRecord, logSystem } = require('./db.js');

// User-Agent ротация
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36 Edg/122.0.0.0'
];

function getRandomUA() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// Задержка (sleep)
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Очистка HTML тегов и HTML entities
function cleanHtmlText(text) {
  if (!text) return '';
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&laquo;|&raquo;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

// Извлечение чистого домена
function extractDomain(urlStr) {
  try {
    const parsed = new URL(urlStr);
    return parsed.hostname.replace(/^www\./, '');
  } catch (e) {
    return urlStr;
  }
}

// Нормализация и форматирование телефонных номеров
function normalizePhone(rawPhone) {
  const digits = rawPhone.replace(/\D/g, '');
  if (digits.length === 11) {
    const code = digits[0] === '7' || digits[0] === '8' ? '+7' : `+${digits[0]}`;
    return `${code} (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  } else if (digits.length === 10) {
    return `+7 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6, 8)}-${digits.slice(8, 10)}`;
  }
  return rawPhone.trim();
}

// Проверка email на фиктивность / системный мусор
function isValidEmail(email) {
  const lower = email.toLowerCase();
  if (lower.length > 60 || lower.length < 6) return false;
  const invalidExtensions = ['.png', '.jpg', '.jpeg', '.svg', '.gif', '.webp', '.js', '.css', '.woff', '.ico'];
  if (invalidExtensions.some(ext => lower.endsWith(ext))) return false;
  const blacklistedSubstrings = [
    'example.com', 'domain.com', 'sentry', 'wixpress', 'schema.org', 'bootstrap',
    'rating', 'webpack', 'react', 'git@', 'test@', 'mail@mail.ru', 'someone@',
    'support@google.com', 'no-reply', 'noreply', 'cloudflare'
  ];
  if (blacklistedSubstrings.some(b => lower.includes(b))) return false;
  return true;
}

// Экстрактор контактов из HTML и текста страницы
function extractContacts(html, pageUrl) {
  const emails = new Set();
  const phones = new Set();
  const telegram = new Set();
  const whatsapp = new Set();
  const vk = new Set();
  const instagram = new Set();

  if (!html) {
    return {
      emails: [],
      phones: [],
      socials: { telegram: [], whatsapp: [], vk: [], instagram: [] }
    };
  }

  // 1. Поиск mailto:
  const mailtoMatches = html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi);
  for (const m of mailtoMatches) {
    if (isValidEmail(m[1])) emails.add(m[1].toLowerCase());
  }

  // 2. Поиск email по всему тексту и атрибутам
  const emailRegex = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
  const rawEmails = html.match(emailRegex) || [];
  for (const em of rawEmails) {
    if (isValidEmail(em)) emails.add(em.toLowerCase());
  }

  // 3. Поиск tel:
  const telMatches = html.matchAll(/tel:([+\d\s().-]{7,25})/gi);
  for (const m of telMatches) {
    const raw = m[1].trim();
    const cleanDigits = raw.replace(/\D/g, '');
    if (cleanDigits.length >= 10 && cleanDigits.length <= 15) {
      phones.add(normalizePhone(raw));
    }
  }

  // 4. Поиск телефонов по регулярным выражениям (Россия/СНГ/Международные)
  // Форматы: +7 (999) 123-45-67, 8 (800) 555-35-35, +7 495 123-45-67, 8-916-123-45-67
  const phonePatterns = [
    /(?:\+7|8)[\s\-(]?\(?(\d{3})\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/g,
    /(?:\+7|8)[\s\-]?\(?800\)?[\s\-]?(\d{3})[\s\-]?(\d{2})[\s\-]?(\d{2})/g,
    /(?:\+7|8)[\s\-(]?\(?(\d{4})\)?[\s\-]?(\d{2})[\s\-]?(\d{2})[\s\-]?(\d{2})/g
  ];

  for (const pattern of phonePatterns) {
    const matches = html.matchAll(pattern);
    for (const match of matches) {
      const full = match[0].trim();
      const digits = full.replace(/\D/g, '');
      // Проверка: не год ли это и не длинный числовой идентификатор
      if (digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))) {
        // Исключаем даты и последовательности вида 2024, 2025, 2026
        if (!full.includes('2024') && !full.includes('2025') && !full.includes('2026') && !full.includes('0000000')) {
          phones.add(normalizePhone(full));
        }
      }
    }
  }

  // 5. Мессенджеры и соцсети
  // Telegram
  const tgMatches = html.matchAll(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([a-zA-Z0-9_]{4,32})/gi);
  for (const m of tgMatches) {
    const username = m[1];
    if (!['share', 'joinchat', 'addstickers', 'proxy', 'socks'].includes(username.toLowerCase())) {
      telegram.add(`https://t.me/${username}`);
    }
  }

  // WhatsApp
  const waMatches = html.matchAll(/(?:https?:\/\/)?(?:wa\.me|api\.whatsapp\.com\/send\?phone=)(\d{10,15})/gi);
  for (const m of waMatches) {
    const num = m[1];
    whatsapp.add(`https://wa.me/${num}`);
  }

  // VK
  const vkMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?vk\.com\/([a-zA-Z0-9_.-]{3,40})/gi);
  for (const m of vkMatches) {
    const slug = m[1].toLowerCase();
    if (!['share.php', 'widget', 'away.php', 'feed', 'login', 'im'].includes(slug)) {
      vk.add(`https://vk.com/${slug}`);
    }
  }

  // Instagram
  const igMatches = html.matchAll(/(?:https?:\/\/)?(?:www\.)?instagram\.com\/([a-zA-Z0-9_.-]{3,30})/gi);
  for (const m of igMatches) {
    const user = m[1].toLowerCase();
    if (!['p', 'reel', 'stories', 'explore', 'about', 'legal'].includes(user)) {
      instagram.add(`https://instagram.com/${user}`);
    }
  }

  return {
    emails: Array.from(emails).slice(0, 10),
    phones: Array.from(phones).slice(0, 10),
    socials: {
      telegram: Array.from(telegram).slice(0, 5),
      whatsapp: Array.from(whatsapp).slice(0, 5),
      vk: Array.from(vk).slice(0, 5),
      instagram: Array.from(instagram).slice(0, 5)
    }
  };
}

// Загрузка веб-страницы с тайм-аутом и заголовками
async function fetchPage(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache'
      },
      redirect: 'follow'
    });
    clearTimeout(id);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/html') && !contentType.includes('text/plain') && !contentType.includes('application/xhtml')) {
      return { ok: false, status: res.status, error: 'Not HTML content' };
    }

    const html = await res.text();
    return { ok: true, status: res.status, html, finalUrl: res.url || url };
  } catch (err) {
    clearTimeout(id);
    return { ok: false, status: 0, error: err.message };
  }
}

// Извлечение заголовка страницы
function extractTitle(html) {
  const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (match && match[1]) {
    return cleanHtmlText(match[1]);
  }
  const h1Match = html.match(/<h1[^>]*>([^<]*)<\/h1>/i);
  if (h1Match && h1Match[1]) {
    return cleanHtmlText(h1Match[1]);
  }
  return '';
}

// Извлечение описания
function extractDescription(html) {
  const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (metaDesc && metaDesc[1]) {
    return cleanHtmlText(metaDesc[1]);
  }
  const ogDesc = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i);
  if (ogDesc && ogDesc[1]) {
    return cleanHtmlText(ogDesc[1]);
  }
  return '';
}

// Создание краткого резюме текста страницы
function extractContentSummary(html) {
  const cleaned = cleanHtmlText(html);
  if (cleaned.length <= 400) return cleaned;
  return cleaned.slice(0, 397) + '...';
}

// Поиск ссылок на страницу контактов на том же домене
function findContactPageLinks(html, baseUrl) {
  const contactLinks = new Set();
  const contactKeywords = ['contact', 'kontakty', 'contacts', 'o-nas', 'about', 'feedback', 'rekvizity'];

  try {
    const base = new URL(baseUrl);
    const linkMatches = html.matchAll(/<a[^>]*href=["']([^"']+)["'][^>]*>/gi);
    for (const m of linkMatches) {
      const href = m[1].trim();
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('#') || href.startsWith('javascript:')) {
        continue;
      }
      try {
        const fullUrl = new URL(href, baseUrl);
        // Только тот же домен
        if (fullUrl.hostname === base.hostname) {
          const lowerPath = fullUrl.pathname.toLowerCase();
          if (contactKeywords.some(kw => lowerPath.includes(kw))) {
            contactLinks.add(fullUrl.toString());
          }
        }
      } catch (e) {}
    }
  } catch (e) {}

  return Array.from(contactLinks).slice(0, 2);
}

// Парсинг целевого сайта и сбор всех данных
async function processTargetSite(targetUrl, keyword = '', deepScan = true) {
  const domain = extractDomain(targetUrl);
  const pageResult = await fetchPage(targetUrl, 9000);

  if (!pageResult.ok) {
    return {
      success: false,
      url: targetUrl,
      domain,
      keyword,
      error: pageResult.error
    };
  }

  const html = pageResult.html;
  const title = extractTitle(html) || domain;
  const description = extractDescription(html);
  const summary = extractContentSummary(html);

  // Сбор контактов с главной/входной страницы
  let contacts = extractContacts(html, targetUrl);

  // Глубокий анализ контактов: если на главной контактов мало, проверяем страницу контактов
  if (deepScan && contacts.emails.length === 0 && contacts.phones.length === 0) {
    const contactPages = findContactPageLinks(html, targetUrl);
    for (const cUrl of contactPages) {
      await sleep(500);
      const subPage = await fetchPage(cUrl, 6000);
      if (subPage.ok && subPage.html) {
        const subContacts = extractContacts(subPage.html, cUrl);
        // Объединяем контакты
        contacts.emails = Array.from(new Set([...contacts.emails, ...subContacts.emails]));
        contacts.phones = Array.from(new Set([...contacts.phones, ...subContacts.phones]));
        contacts.socials.telegram = Array.from(new Set([...contacts.socials.telegram, ...subContacts.socials.telegram]));
        contacts.socials.whatsapp = Array.from(new Set([...contacts.socials.whatsapp, ...subContacts.socials.whatsapp]));
        contacts.socials.vk = Array.from(new Set([...contacts.socials.vk, ...subContacts.socials.vk]));
        contacts.socials.instagram = Array.from(new Set([...contacts.socials.instagram, ...subContacts.socials.instagram]));
      }
    }
  }

  const record = {
    keyword,
    url: pageResult.finalUrl || targetUrl,
    domain,
    title,
    description: description || summary.slice(0, 200),
    emails: contacts.emails,
    phones: contacts.phones,
    socials: contacts.socials,
    content_summary: summary,
    status_code: pageResult.status
  };

  saveRecord(record);
  return { success: true, record };
}

// Поиск через DuckDuckGo HTML
async function searchDuckDuckGo(query, limit = 10) {
  const results = [];
  try {
    const encodedQ = encodeURIComponent(query);
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQ}`;

    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8'
      }
    });

    if (!res.ok) {
      logSystem('WARN', `DuckDuckGo вернул статус ${res.status} для запроса: ${query}`);
      return results;
    }

    const html = await res.text();

    // Парсинг блоков ссылок в результатах поиска
    // В DDG HTML: <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2F...
    const linkMatches = html.matchAll(/<a[^>]*class=["'][^"']*result__url[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
    for (const m of linkMatches) {
      let rawHref = m[1];
      let finalUrl = '';

      if (rawHref.includes('uddg=')) {
        const matchUddg = rawHref.match(/[?&]uddg=([^&]+)/);
        if (matchUddg) {
          finalUrl = decodeURIComponent(matchUddg[1]);
        }
      } else if (rawHref.startsWith('http')) {
        finalUrl = rawHref;
      }

      if (finalUrl && !finalUrl.includes('duckduckgo.com') && !finalUrl.includes('yandex.ru/search') && !finalUrl.includes('google.com/search')) {
        if (!results.includes(finalUrl)) {
          results.push(finalUrl);
          if (results.length >= limit) break;
        }
      }
    }

    // Если ссылок мало, парсим заголовки result__title
    if (results.length < limit) {
      const titleLinks = html.matchAll(/<a[^>]*class=["'][^"']*result__a[^"']*["'][^>]*href=["']([^"']+)["'][^>]*>/gi);
      for (const m of titleLinks) {
        let rawHref = m[1];
        let finalUrl = '';
        if (rawHref.includes('uddg=')) {
          const matchUddg = rawHref.match(/[?&]uddg=([^&]+)/);
          if (matchUddg) finalUrl = decodeURIComponent(matchUddg[1]);
        } else if (rawHref.startsWith('http')) {
          finalUrl = rawHref;
        }

        if (finalUrl && !results.includes(finalUrl) && !finalUrl.includes('duckduckgo.com')) {
          results.push(finalUrl);
          if (results.length >= limit) break;
        }
      }
    }
  } catch (err) {
    logSystem('ERROR', `Ошибка поиска DuckDuckGo: ${err.message}`);
  }

  return results;
}

// Поиск через Bing (в качестве резервного или комбинированного источника)
async function searchBing(query, limit = 10) {
  const results = [];
  try {
    const encodedQ = encodeURIComponent(query);
    const searchUrl = `https://www.bing.com/search?q=${encodedQ}&setlang=ru-RU`;

    const res = await fetch(searchUrl, {
      headers: {
        'User-Agent': getRandomUA(),
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9'
      }
    });

    if (!res.ok) return results;

    const html = await res.text();
    const linkMatches = html.matchAll(/<h2><a[^>]*href=["'](https?:\/\/[^"']+)["'][^>]*>/gi);

    for (const m of linkMatches) {
      const url = m[1];
      if (!url.includes('bing.com') && !url.includes('microsoft.com') && !url.includes('msn.com')) {
        if (!results.includes(url)) {
          results.push(url);
          if (results.length >= limit) break;
        }
      }
    }
  } catch (err) {
    logSystem('WARN', `Ошибка поиска Bing: ${err.message}`);
  }

  return results;
}

// Комбинированный умный поиск (DDG + Bing fallback)
async function searchMultiEngine(query, limit = 8) {
  let urls = await searchDuckDuckGo(query, limit);
  if (urls.length < Math.min(3, limit)) {
    await sleep(1000);
    const bingUrls = await searchBing(query, limit);
    for (const u of bingUrls) {
      if (!urls.includes(u)) urls.push(u);
      if (urls.length >= limit) break;
    }
  }
  return urls.slice(0, limit);
}

// Менеджер очереди фонового сбора
class QueueController {
  constructor() {
    this.status = 'idle'; // 'idle', 'running', 'paused', 'stopped'
    this.totalKeywords = 0;
    this.currentKeywordIndex = 0;
    this.currentKeyword = '';
    this.totalFound = 0;
    this.currentSite = '';
    this.delayMs = 2500;
    this.depthLimit = 6;
    this.deepScan = true;
    this.shouldStop = false;
    this.isPaused = false;
  }

  getStatus() {
    return {
      status: this.status,
      totalKeywords: this.totalKeywords,
      currentKeywordIndex: this.currentKeywordIndex,
      currentKeyword: this.currentKeyword,
      totalFound: this.totalFound,
      currentSite: this.currentSite,
      delayMs: this.delayMs,
      depthLimit: this.depthLimit,
      progressPercent: this.totalKeywords > 0 
        ? Math.round((this.currentKeywordIndex / this.totalKeywords) * 100) 
        : 0
    };
  }

  pause() {
    if (this.status === 'running') {
      this.status = 'paused';
      this.isPaused = true;
      logSystem('INFO', 'Фоновый автопоиск приостановлен пользователем');
    }
  }

  resume() {
    if (this.status === 'paused') {
      this.status = 'running';
      this.isPaused = false;
      logSystem('INFO', 'Фоновый автопоиск возобновлен');
    }
  }

  stop() {
    this.shouldStop = true;
    this.status = 'stopped';
    this.isPaused = false;
    logSystem('INFO', 'Остановка очереди автопоиска...');
  }

  async startBatch(keywordsList, { depth = 6, delay = 2500, deepScan = true } = {}) {
    if (this.status === 'running') {
      throw new Error('Сбор уже запущен');
    }

    this.status = 'running';
    this.shouldStop = false;
    this.isPaused = false;
    this.totalKeywords = keywordsList.length;
    this.currentKeywordIndex = 0;
    this.depthLimit = Math.max(1, Math.min(depth, 20));
    this.delayMs = Math.max(1000, delay);
    this.deepScan = deepScan;
    this.totalFound = 0;

    logSystem('INFO', `Запуск автопоиска: ${keywordsList.length} ключевых слов, глубина ${this.depthLimit} сайтов`);

    // Фоновый цикл обработки
    (async () => {
      try {
        for (let i = 0; i < keywordsList.length; i++) {
          if (this.shouldStop) break;

          // Обработка паузы
          while (this.isPaused && !this.shouldStop) {
            await sleep(1000);
          }
          if (this.shouldStop) break;

          this.currentKeywordIndex = i + 1;
          const kwItem = keywordsList[i];
          const query = typeof kwItem === 'string' ? kwItem : kwItem.word;
          this.currentKeyword = query;

          logSystem('INFO', `[${this.currentKeywordIndex}/${this.totalKeywords}] Поиск в сети по запросу: "${query}"`);

          const urls = await searchMultiEngine(query, this.depthLimit);
          logSystem('INFO', `Найдено сайтов в выдаче: ${urls.length} по запросу "${query}"`);

          for (const targetUrl of urls) {
            if (this.shouldStop) break;
            while (this.isPaused && !this.shouldStop) {
              await sleep(1000);
            }
            if (this.shouldStop) break;

            this.currentSite = targetUrl;
            try {
              const res = await processTargetSite(targetUrl, query, this.deepScan);
              if (res.success) {
                this.totalFound++;
                const r = res.record;
                const contactsDesc = [];
                if (r.phones.length) contactsDesc.push(`📞 ${r.phones.length}`);
                if (r.emails.length) contactsDesc.push(`✉️ ${r.emails.length}`);
                if (r.socials.telegram.length) contactsDesc.push(`✈️ TG`);
                const badge = contactsDesc.length > 0 ? ` [${contactsDesc.join(', ')}]` : '';
                logSystem('SUCCESS', `Собраны данные: ${r.domain}${badge}`);
              } else {
                logSystem('WARN', `Не удалось открыть ${targetUrl}: ${res.error}`);
              }
            } catch (err) {
              logSystem('ERROR', `Ошибка парсинга ${targetUrl}: ${err.message}`);
            }

            // Вежливая пауза между сайтами для антибана
            await sleep(this.delayMs);
          }

          // Дополнительная пауза между ключевыми словами
          await sleep(1500);
        }

        this.status = this.shouldStop ? 'stopped' : 'finished';
        logSystem('SUCCESS', `Автопоиск завершен! Всего успешно обработано сайтов: ${this.totalFound}`);
      } catch (err) {
        this.status = 'stopped';
        logSystem('ERROR', `Критический сбой автопоиска: ${err.message}`);
      } finally {
        this.currentSite = '';
        this.shouldStop = false;
        this.isPaused = false;
      }
    })();

    return { started: true, total: this.totalKeywords };
  }
}

const queueController = new QueueController();

module.exports = {
  processTargetSite,
  searchMultiEngine,
  queueController,
  extractContacts
};
