// antidrugsystem - База данных SQLite (Native node:sqlite)
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.join(__dirname, 'antidrugsystem.db');
const db = new DatabaseSync(DB_PATH);

// Инициализация структуры таблиц
function initDB() {
  // Настройка WAL режима и быстрых прагм
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');

  // Таблица собранных записей (сайты, контакты, сниппеты)
  db.exec(`
    CREATE TABLE IF NOT EXISTS records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      keyword TEXT NOT NULL,
      url TEXT NOT NULL UNIQUE,
      domain TEXT NOT NULL,
      title TEXT,
      description TEXT,
      emails TEXT,       -- JSON array [str]
      phones TEXT,       -- JSON array [str]
      socials TEXT,      -- JSON object {telegram, whatsapp, vk, instagram}
      content_summary TEXT,
      status_code INTEGER DEFAULT 200,
      collected_at TEXT NOT NULL,
      created_timestamp INTEGER NOT NULL
    );
  `);

  // Таблица ключевых слов (каталог 100 слов)
  db.exec(`
    CREATE TABLE IF NOT EXISTS keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      last_searched_at TEXT,
      total_found INTEGER DEFAULT 0
    );
  `);

  // Таблица логов системы
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
  `);

  // Индексы для быстрой выборки и фильтрации
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_records_keyword ON records(keyword);
    CREATE INDEX IF NOT EXISTS idx_records_domain ON records(domain);
    CREATE INDEX IF NOT EXISTS idx_records_created ON records(created_timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_keywords_active ON keywords(active);
  `);

  // Предзаполнение 100 слов про еду, если таблица пуста
  seedKeywordsIfEmpty();
}

// 100 эталонных слов и направлений про еду и рестораны
const DEFAULT_FOOD_KEYWORDS = [
  // 1. Общепит и заведения
  { word: "Ресторан авторской кухни", category: "Заведения и общепит" },
  { word: "Кафе и пекарня", category: "Заведения и общепит" },
  { word: "Пиццерия дровяная печь", category: "Заведения и общепит" },
  { word: "Суши-бар доставка роллов", category: "Заведения и общепит" },
  { word: "Бургерная крафтовая", category: "Заведения и общепит" },
  { word: "Кофейня со спешелти кофе", category: "Заведения и общепит" },
  { word: "Кондитерская мастерская тортов", category: "Заведения и общепит" },
  { word: "Столовая домашняя еда", category: "Заведения и общепит" },
  { word: "Шашлычная мясо на мангале", category: "Заведения и общепит" },
  { word: "Чайхана восточная кухня", category: "Заведения и общепит" },
  { word: "Хинкальная грузинская кухня", category: "Заведения и общепит" },
  { word: "Паб крафтовое пиво", category: "Заведения и общепит" },
  { word: "Гастропаб с едой", category: "Заведения и общепит" },
  { word: "Бистро европейская кухня", category: "Заведения и общепит" },
  { word: "Фудтрак стритфуд", category: "Заведения и общепит" },
  { word: "Пельменная ручная лепка", category: "Заведения и общепит" },
  { word: "Раменная японская лапша", category: "Заведения и общепит" },
  { word: "Вок паназиатская кухня", category: "Заведения и общепит" },
  { word: "Чебуречная и пирожковая", category: "Заведения и общепит" },
  { word: "Блинная русские блины", category: "Заведения и общепит" },
  { word: "Стейкхаус мясо гриль", category: "Заведения и общепит" },
  { word: "Рыбный ресторан морепродукты", category: "Заведения и общепит" },
  { word: "Веганское и вегетарианское кафе", category: "Заведения и общепит" },
  { word: "Антикафе с кофе и десертами", category: "Заведения и общепит" },
  { word: "Тапас-бар закуски", category: "Заведения и общепит" },
  { word: "Кальянная с кухней", category: "Заведения и общепит" },
  { word: "Лаундж-бар авторские коктейли", category: "Заведения и общепит" },
  { word: "Детское семейное кафе", category: "Заведения и общепит" },
  { word: "Траттория домашняя паста", category: "Заведения и общепит" },
  { word: "Гриль-бар колбаски и стейки", category: "Заведения и общепит" },

  // 2. Доставка еды и кейтеринг
  { word: "Доставка готовой еды на неделю", category: "Доставка и кейтеринг" },
  { word: "Кейтеринг выездное обслуживание", category: "Доставка и кейтеринг" },
  { word: "Доставка комплексных обедов в офис", category: "Доставка и кейтеринг" },
  { word: "Доставка горячей пиццы", category: "Доставка и кейтеринг" },
  { word: "Доставка свежих суши и сетов", category: "Доставка и кейтеринг" },
  { word: "Организация фуршетов и кофе-брейков", category: "Доставка и кейтеринг" },
  { word: "Выездной банкет кейтеринг", category: "Доставка и кейтеринг" },
  { word: "Доставка правильного питания рационы", category: "Доставка и кейтеринг" },
  { word: "Банкетный зал свадьба юбилей", category: "Доставка и кейтеринг" },
  { word: "Полевая кухня на мероприятие", category: "Доставка и кейтеринг" },
  { word: "Доставка шашлыка и плова", category: "Доставка и кейтеринг" },
  { word: "Доставка осетинских пирогов", category: "Доставка и кейтеринг" },
  { word: "Доставка еды для похудения", category: "Доставка и кейтеринг" },
  { word: "Корпоративное питание сотрудников", category: "Доставка и кейтеринг" },
  { word: "Детский кейтеринг праздники", category: "Доставка и кейтеринг" },

  // 3. Продукты, фермы и производство
  { word: "Частная сыроварня крафтовый сыр", category: "Продукты и фермы" },
  { word: "Фермерские продукты доставка", category: "Продукты и фермы" },
  { word: "Мясная лавка свежее мясо", category: "Продукты и фермы" },
  { word: "Рыбный магазин свежая рыба", category: "Продукты и фермы" },
  { word: "Пасека натуральный мед с пасеки", category: "Продукты и фермы" },
  { word: "Пекарня ремесленный хлеб на закваске", category: "Продукты и фермы" },
  { word: "Кондитерская фабрика сладости оптом", category: "Продукты и фермы" },
  { word: "Шоколадная мастерская ручной работы", category: "Продукты и фермы" },
  { word: "Чайный бутик элитный чай", category: "Продукты и фермы" },
  { word: "Обжарка кофе свежеобжаренный", category: "Продукты и фермы" },
  { word: "Оптовая база продуктов питания", category: "Продукты и фермы" },
  { word: "Поставщик овощей и фруктов", category: "Продукты и фермы" },
  { word: "Поставщик охлажденного мяса", category: "Продукты и фермы" },
  { word: "Поставщик рыбы и морепродуктов", category: "Продукты и фермы" },
  { word: "Производство полуфабрикатов пельмени", category: "Продукты и фермы" },
  { word: "Экомаркет натуральные биопродукты", category: "Продукты и фермы" },
  { word: "Сыры ручной работы качотта", category: "Продукты и фермы" },
  { word: "Домашняя колбаса и копчености", category: "Продукты и фермы" },
  { word: "Соленья и квашеная капуста бочковые", category: "Продукты и фермы" },
  { word: "Молочная ферма фермерское молоко", category: "Продукты и фермы" },

  // 4. Блюда, кухни мира и десерты
  { word: "Торты на заказ индивидуальный дизайн", category: "Блюда и десерты" },
  { word: "Пироги на заказ русские и татарские", category: "Блюда и десерты" },
  { word: "Итальянская кухня паста ризотто", category: "Блюда и десерты" },
  { word: "Грузинская кухня хачапури шашлык", category: "Блюда и десерты" },
  { word: "Кавказская кухня люля-кебаб", category: "Блюда и десерты" },
  { word: "Азиатская кухня том-ям фо-бо", category: "Блюда и десерты" },
  { word: "Узбекская кухня плов самса", category: "Блюда и десерты" },
  { word: "Авторская кухня блюда от шефа", category: "Блюда и десерты" },
  { word: "Морепродукты устрицы мидии", category: "Блюда и десерты" },
  { word: "Десерты на заказ капкейки макаруны", category: "Блюда и десерты" },
  { word: "Моти японские десерты на заказ", category: "Блюда и десерты" },
  { word: "Безглютеновая выпечка и хлеб", category: "Блюда и десерты" },
  { word: "Халяль продукты и готовая еда", category: "Блюда и десерты" },
  { word: "Кошерная кухня и кошерные продукты", category: "Блюда и десерты" },
  { word: "Шоколад ручной работы на заказ", category: "Блюда и десерты" },
  { word: "Имбирные пряники ручная роспись", category: "Блюда и десерты" },
  { word: "Натуральный мармелад и зефир", category: "Блюда и десерты" },
  { word: "Домашнее мороженое джелато", category: "Блюда и десерты" },
  { word: "Круассаны и французская выпечка", category: "Блюда и десерты" },
  { word: "Доставка свежей выпечки утром", category: "Блюда и десерты" },

  // 5. Оборудование, сервис и ресторанный бизнес
  { word: "Шеф-повар на выезд частные ужины", category: "Сервис и опт" },
  { word: "Кулинарные мастер-классы для взрослых", category: "Сервис и опт" },
  { word: "Кейтеринг на свадьбу под ключ", category: "Сервис и опт" },
  { word: "Организация кофе-брейка на конференции", category: "Сервис и опт" },
  { word: "Ресторанный консалтинг открытие кафе", category: "Сервис и опт" },
  { word: "Профессиональное кухонное оборудование", category: "Сервис и опт" },
  { word: "Одноразовая экоупаковка для еды", category: "Сервис и опт" },
  { word: "Посуда и инвентарь для ресторанов", category: "Сервис и опт" },
  { word: "Соусы и заправки оптом от производителя", category: "Сервис и опт" },
  { word: "Специи и пряности прямые поставки", category: "Сервис и опт" },
  { word: "Чай и кофе оптом для HoReCa", category: "Сервис и опт" },
  { word: "Сиропы и топпинги для кофейни", category: "Сервис и опт" },
  { word: "Продукты для суши оптом водоросли рис", category: "Сервис и опт" },
  { word: "Замороженные полуфабрикаты для общепита", category: "Сервис и опт" },
  { word: "Барный инвентарь и стекло для баров", category: "Сервис и опт" }
];

function seedKeywordsIfEmpty() {
  const row = db.prepare('SELECT COUNT(*) as count FROM keywords').get();
  if (row.count === 0) {
    const insertStmt = db.prepare('INSERT INTO keywords (word, category, active) VALUES (?, ?, 1)');
    for (const item of DEFAULT_FOOD_KEYWORDS) {
      try {
        insertStmt.run(item.word, item.category);
      } catch (err) {
        // ignore duplicate
      }
    }
    logSystem('INFO', `Инициализирован каталог из ${DEFAULT_FOOD_KEYWORDS.length} кулинарных слов и фраз`);
  }
}

// Запись системных сообщений в базу
function logSystem(level, message) {
  const now = new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  try {
    const stmt = db.prepare('INSERT INTO logs (level, message, timestamp) VALUES (?, ?, ?)');
    stmt.run(level, message, now);
    // Держим лог не более 500 записей
    db.exec('DELETE FROM logs WHERE id NOT IN (SELECT id FROM logs ORDER BY id DESC LIMIT 500)');
  } catch (e) {
    console.error('Ошибка записи лога:', e);
  }
}

// Сохранение или обновление записи о сайте
function saveRecord(record) {
  const now = new Date();
  const collectedAt = now.toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const timestamp = now.getTime();

  const emailsJson = JSON.stringify(record.emails || []);
  const phonesJson = JSON.stringify(record.phones || []);
  const socialsJson = JSON.stringify(record.socials || {});

  try {
    const upsertStmt = db.prepare(`
      INSERT INTO records (
        keyword, url, domain, title, description,
        emails, phones, socials, content_summary,
        status_code, collected_at, created_timestamp
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(url) DO UPDATE SET
        keyword = excluded.keyword,
        title = excluded.title,
        description = excluded.description,
        emails = excluded.emails,
        phones = excluded.phones,
        socials = excluded.socials,
        content_summary = excluded.content_summary,
        status_code = excluded.status_code,
        collected_at = excluded.collected_at,
        created_timestamp = excluded.created_timestamp
    `);

    upsertStmt.run(
      record.keyword || 'Ручной поиск',
      record.url,
      record.domain,
      record.title || '',
      record.description || '',
      emailsJson,
      phonesJson,
      socialsJson,
      record.content_summary || '',
      record.status_code || 200,
      collectedAt,
      timestamp
    );

    // Обновляем статистику ключевого слова
    if (record.keyword) {
      try {
        const updateKw = db.prepare(`
          UPDATE keywords 
          SET last_searched_at = ?, total_found = total_found + 1
          WHERE word = ?
        `);
        updateKw.run(collectedAt, record.keyword);
      } catch (err) {}
    }

    return true;
  } catch (err) {
    console.error('Ошибка сохранения записи:', err);
    logSystem('ERROR', `Ошибка сохранения ${record.url}: ${err.message}`);
    return false;
  }
}

// Получение списка записей с фильтрацией и пагинацией
function getRecords({ page = 1, limit = 50, search = '', filter = 'all', keyword = '' } = {}) {
  let query = 'SELECT * FROM records WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (title LIKE ? OR url LIKE ? OR domain LIKE ? OR description LIKE ? OR content_summary LIKE ? OR emails LIKE ? OR phones LIKE ?)';
    const term = `%${search}%`;
    params.push(term, term, term, term, term, term, term);
  }

  if (keyword) {
    query += ' AND keyword = ?';
    params.push(keyword);
  }

  if (filter === 'with_email') {
    query += " AND emails != '[]' AND emails IS NOT NULL";
  } else if (filter === 'with_phone') {
    query += " AND phones != '[]' AND phones IS NOT NULL";
  } else if (filter === 'with_socials') {
    query += " AND (socials LIKE '%t.me%' OR socials LIKE '%wa.me%' OR socials LIKE '%vk.com%')";
  } else if (filter === 'with_contacts') {
    query += " AND (emails != '[]' OR phones != '[]' OR socials LIKE '%t.me%' OR socials LIKE '%wa.me%' OR socials LIKE '%vk.com%')";
  }

  // Общее количество
  const countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total');
  const countRow = db.prepare(countQuery).get(...params);
  const total = countRow ? countRow.total : 0;

  // Сортировка и пагинация
  query += ' ORDER BY created_timestamp DESC LIMIT ? OFFSET ?';
  const offset = (page - 1) * limit;
  params.push(limit, offset);

  const rawRows = db.prepare(query).all(...params);
  const records = rawRows.map(r => ({
    ...r,
    emails: JSON.parse(r.emails || '[]'),
    phones: JSON.parse(r.phones || '[]'),
    socials: JSON.parse(r.socials || '{}')
  }));

  return {
    records,
    total,
    page,
    totalPages: Math.ceil(total / limit) || 1
  };
}

// Статистика системы
function getStats() {
  const totalRecords = db.prepare('SELECT COUNT(*) as count FROM records').get().count;
  const uniqueDomains = db.prepare('SELECT COUNT(DISTINCT domain) as count FROM records').get().count;
  
  // Количество с контактами
  const withEmail = db.prepare("SELECT COUNT(*) as count FROM records WHERE emails != '[]' AND emails IS NOT NULL").get().count;
  const withPhone = db.prepare("SELECT COUNT(*) as count FROM records WHERE phones != '[]' AND phones IS NOT NULL").get().count;
  const withSocials = db.prepare("SELECT COUNT(*) as count FROM records WHERE (socials LIKE '%t.me%' OR socials LIKE '%wa.me%' OR socials LIKE '%vk.com%')").get().count;
  
  const totalKeywords = db.prepare('SELECT COUNT(*) as count FROM keywords').get().count;
  const activeKeywords = db.prepare('SELECT COUNT(*) as count FROM keywords WHERE active = 1').get().count;
  const searchedKeywords = db.prepare('SELECT COUNT(*) as count FROM keywords WHERE last_searched_at IS NOT NULL').get().count;

  return {
    totalRecords,
    uniqueDomains,
    withEmail,
    withPhone,
    withSocials,
    totalKeywords,
    activeKeywords,
    searchedKeywords
  };
}

// Получение ключевых слов
function getKeywords() {
  return db.prepare('SELECT * FROM keywords ORDER BY id ASC').all();
}

// Добавление ключевого слова
function addKeyword(word, category = 'Пользовательские') {
  try {
    const stmt = db.prepare('INSERT INTO keywords (word, category, active) VALUES (?, ?, 1)');
    const res = stmt.run(word.trim(), category.trim());
    return { success: true, id: res.lastInsertRowid };
  } catch (err) {
    return { success: false, error: 'Слово уже существует или недопустимо' };
  }
}

// Переключение активности слова
function toggleKeyword(id, active) {
  const stmt = db.prepare('UPDATE keywords SET active = ? WHERE id = ?');
  stmt.run(active ? 1 : 0, id);
  return { success: true };
}

// Удаление ключевого слова
function deleteKeyword(id) {
  const stmt = db.prepare('DELETE FROM keywords WHERE id = ?');
  stmt.run(id);
  return { success: true };
}

// Удаление записи
function deleteRecord(id) {
  const stmt = db.prepare('DELETE FROM records WHERE id = ?');
  stmt.run(id);
  return { success: true };
}

// Очистить все записи
function clearAllRecords() {
  db.exec('DELETE FROM records');
  db.exec('UPDATE keywords SET total_found = 0');
  logSystem('WARN', 'База данных собранных контактов очищена пользователем');
  return { success: true };
}

// Получить логи
function getLogs(limit = 100) {
  return db.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT ?').all(limit);
}

// Экспорт всех данных
function getAllRecordsForExport() {
  const rawRows = db.prepare('SELECT * FROM records ORDER BY created_timestamp DESC').all();
  return rawRows.map(r => ({
    ...r,
    emails: JSON.parse(r.emails || '[]'),
    phones: JSON.parse(r.phones || '[]'),
    socials: JSON.parse(r.socials || '{}')
  }));
}

module.exports = {
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
  getAllRecordsForExport,
  DEFAULT_FOOD_KEYWORDS
};
