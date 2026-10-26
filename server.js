// antidrugsystem - Сервер системы сбора и анализа данных
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');

const {
  initDB,
  saveRecord,
  getRecords,
  getStats,
  getKeywords,
  addKeyword,
  toggleKeyword,
  deleteKeyword,
  deleteRecord,
  clearAllRecords,
  logSystem,
  getLogs,
  getAllRecordsForExport
} = require('./db.js');

const {
  processTargetSite,
  searchMultiEngine,
  queueController
} = require('./scraper.js');

const {
  generateFormattedXlsx,
  cleanDescription
} = require('./excelExporter.js');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Инициализация базы данных
initDB();

// Вспомогательная функция для чтения тела JSON запроса
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (body.length > 5 * 1024 * 1024) {
        reject(new Error('Размер тела запроса превышает 5MB'));
      }
    });
    req.on('end', () => {
      try {
        if (!body) return resolve({});
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Некорректный JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Ответ JSON
function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

// MIME-типы статики
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

// Создание HTTP-сервера
const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // API Маршруты
  try {
    // 1. Статистика
    if (pathname === '/api/stats' && method === 'GET') {
      const stats = getStats();
      const queue = queueController.getStatus();
      return sendJson(res, 200, { success: true, stats, queue });
    }

    // 2. Список записей
    if (pathname === '/api/records' && method === 'GET') {
      const page = parseInt(parsedUrl.query.page, 10) || 1;
      const limit = parseInt(parsedUrl.query.limit, 10) || 20;
      const search = parsedUrl.query.search || '';
      const filter = parsedUrl.query.filter || 'all';
      const keyword = parsedUrl.query.keyword || '';

      const data = getRecords({ page, limit, search, filter, keyword });
      return sendJson(res, 200, { success: true, ...data });
    }

    // 3. Удаление одной записи
    if (pathname.startsWith('/api/records/') && method === 'DELETE') {
      const idStr = pathname.replace('/api/records/', '');
      if (idStr === 'all') {
        clearAllRecords();
        return sendJson(res, 200, { success: true, message: 'Все записи удалены' });
      }
      const id = parseInt(idStr, 10);
      deleteRecord(id);
      return sendJson(res, 200, { success: true, message: `Запись #${id} удалена` });
    }

    // 4. Каталог ключевых слов
    if (pathname === '/api/keywords' && method === 'GET') {
      const keywords = getKeywords();
      return sendJson(res, 200, { success: true, keywords });
    }

    if (pathname === '/api/keywords' && method === 'POST') {
      const body = await parseJsonBody(req);
      if (!body.word) {
        return sendJson(res, 400, { success: false, error: 'Поле word обязательно' });
      }
      const result = addKeyword(body.word, body.category || 'Пользовательские');
      return sendJson(res, result.success ? 200 : 400, result);
    }

    if (pathname === '/api/keywords/toggle' && method === 'POST') {
      const body = await parseJsonBody(req);
      toggleKeyword(body.id, body.active);
      return sendJson(res, 200, { success: true });
    }

    if (pathname.startsWith('/api/keywords/') && method === 'DELETE') {
      const id = parseInt(pathname.replace('/api/keywords/', ''), 10);
      deleteKeyword(id);
      return sendJson(res, 200, { success: true });
    }

    // 5. Управление очередью поиска
    if (pathname === '/api/queue/status' && method === 'GET') {
      return sendJson(res, 200, { success: true, status: queueController.getStatus() });
    }

    if (pathname === '/api/queue/start' && method === 'POST') {
      const body = await parseJsonBody(req);
      let listToSearch = [];

      if (Array.isArray(body.keywords) && body.keywords.length > 0) {
        listToSearch = body.keywords;
      } else {
        const allKeywords = getKeywords();
        listToSearch = allKeywords.filter(k => k.active === 1);
      }

      if (listToSearch.length === 0) {
        return sendJson(res, 400, { success: false, error: 'Нет активных ключевых слов для поиска' });
      }

      const options = {
        depth: parseInt(body.depth, 10) || 6,
        delay: parseInt(body.delay, 10) || 2500,
        deepScan: body.deepScan !== false
      };

      const result = await queueController.startBatch(listToSearch, options);
      return sendJson(res, 200, { success: true, ...result });
    }

    if (pathname === '/api/queue/pause' && method === 'POST') {
      queueController.pause();
      return sendJson(res, 200, { success: true, status: queueController.getStatus() });
    }

    if (pathname === '/api/queue/resume' && method === 'POST') {
      queueController.resume();
      return sendJson(res, 200, { success: true, status: queueController.getStatus() });
    }

    if (pathname === '/api/queue/stop' && method === 'POST') {
      queueController.stop();
      return sendJson(res, 200, { success: true, status: queueController.getStatus() });
    }

    // 6. Быстрый одиночный поиск или парсинг конкретного URL
    if (pathname === '/api/search/single' && method === 'POST') {
      const body = await parseJsonBody(req);
      const query = (body.query || '').trim();
      const depth = parseInt(body.depth, 10) || 5;

      if (!query) {
        return sendJson(res, 400, { success: false, error: 'Запрос не указан' });
      }

      // Если введена ссылка напрямую
      if (query.startsWith('http://') || query.startsWith('https://')) {
        const singleRes = await processTargetSite(query, 'Прямой URL', true);
        return sendJson(res, 200, { success: true, count: singleRes.success ? 1 : 0, records: singleRes.success ? [singleRes.record] : [] });
      }

      // Иначе ищем в поисковике
      logSystem('INFO', `Быстрый ручной поиск: "${query}"`);
      const urls = await searchMultiEngine(query, depth);
      const collected = [];

      for (const u of urls) {
        try {
          const r = await processTargetSite(u, query, true);
          if (r.success) collected.push(r.record);
        } catch (e) {}
      }

      return sendJson(res, 200, { success: true, count: collected.length, records: collected });
    }

    // 7. Системные логи
    if (pathname === '/api/logs' && method === 'GET') {
      const logs = getLogs(80);
      return sendJson(res, 200, { success: true, logs });
    }

    // 8. Экспорт данных в нативный форматированный Excel (.xlsx) с автоподбором колонок и переносом
    if (pathname === '/api/export/xlsx' && method === 'GET') {
      const records = getAllRecordsForExport();
      const xlsxBuffer = generateFormattedXlsx(records);
      const dateStr = new Date().toISOString().slice(0, 10);
      const filename = `antidrugsystem_contacts_${dateStr}.xlsx`;

      res.writeHead(200, {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': xlsxBuffer.length
      });
      return res.end(xlsxBuffer);
    }

    // 9. Экспорт данных в CSV (Excel-совместимый UTF-8 с BOM и очисткой переносов)
    if (pathname === '/api/export/csv' && method === 'GET') {
      const records = getAllRecordsForExport();
      
      // UTF-8 BOM для корректного открытия в Excel на русском
      let csvContent = '\uFEFF';
      // Заголовки таблицы
      csvContent += 'ID;Ключевое слово;Домен;Заголовок сайта;URL сайта;Телефоны;Email;Telegram;WhatsApp;VK;Что собрано (описание);Дата сбора\n';

      for (const r of records) {
        const clean = (str) => {
          if (!str) return '""';
          return `"${String(str).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`;
        };

        const phonesStr = (r.phones || []).join(', ');
        const emailsStr = (r.emails || []).join(', ');
        const tgStr = (r.socials?.telegram || []).join(', ');
        const waStr = (r.socials?.whatsapp || []).join(', ');
        const vkStr = (r.socials?.vk || []).join(', ');
        const desc = cleanDescription(r.description || r.content_summary, 300);

        const row = [
          r.id,
          clean(r.keyword),
          clean(r.domain),
          clean(r.title),
          clean(r.url),
          clean(phonesStr),
          clean(emailsStr),
          clean(tgStr),
          clean(waStr),
          clean(vkStr),
          clean(desc),
          clean(r.collected_at)
        ].join(';');

        csvContent += row + '\n';
      }

      const filename = `antidrugsystem_export_${Date.now()}.csv`;
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      return res.end(csvContent);
    }

    // 10. Экспорт в JSON
    if (pathname === '/api/export/json' && method === 'GET') {
      const records = getAllRecordsForExport();
      const filename = `antidrugsystem_export_${Date.now()}.json`;
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      return res.end(JSON.stringify(records, null, 2));
    }

  } catch (err) {
    console.error('Ошибка в обработчике API:', err);
    return sendJson(res, 500, { success: false, error: err.message });
  }

  // Обслуживание статических файлов
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // Безопасность путей (защита от directory traversal)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Access denied');
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // Fallback на index.html для SPA роутинга
        fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, indexContent) => {
          if (err2) {
            res.writeHead(404);
            return res.end('404 Not Found');
          }
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(indexContent);
        });
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  logSystem('SUCCESS', `Сервер AntiDrugSystem запущен на http://localhost:${PORT}`);
  console.log(`====================================================`);
  console.log(`  AntiDrugSystem - Система поиска и сбора контактов  `);
  console.log(`  Интерфейс доступен по адресу: http://localhost:${PORT}`);
  console.log(`====================================================`);
});
