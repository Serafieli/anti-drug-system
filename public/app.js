// AntiDrugSystem - Клиентский модуль управления и отображения данных

// Состояние приложения
const state = {
  activeTab: 'tab-records',
  page: 1,
  limit: 20,
  totalPages: 1,
  totalRecords: 0,
  searchQuery: '',
  filter: 'all',
  keywordFilter: '',
  activeModalRecord: null,
  keywords: [],
  selectedCategory: 'all',
  pollInterval: null
};

// Инициализация при загрузке
document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }

  initTabs();
  initFilters();
  initControls();
  initModal();

  // Первичная загрузка данных
  loadStats();
  loadRecords();
  loadKeywords();
  loadLogs();

  // Запуск постоянного мониторинга статуса очереди
  state.pollInterval = setInterval(pollQueueStatus, 1800);
});

// Уведомления (Toast)
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const bgColors = {
    info: 'bg-slate-800 text-slate-200 border-slate-700',
    success: 'bg-emerald-950 text-emerald-200 border-emerald-700',
    error: 'bg-red-950 text-red-200 border-red-700',
    warning: 'bg-amber-950 text-amber-200 border-amber-700'
  };

  toast.className = `flex items-center space-x-2 px-4 py-2.5 rounded-xl border text-xs shadow-2xl transition-all duration-300 pointer-events-auto transform translate-y-2 opacity-0 ${bgColors[type] || bgColors.info}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);

  // Анимация появления
  requestAnimationFrame(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  });

  // Удаление через 3.5 секунды
  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Копирование в буфер обмена
function copyToClipboard(text, label = 'Скопировано') {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      showToast(`${label}: ${text}`, 'success');
    }).catch(() => fallbackCopy(text, label));
  } else {
    fallbackCopy(text, label);
  }
}

function fallbackCopy(text, label) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
  showToast(`${label}: ${text}`, 'success');
}

// Вкладки
function initTabs() {
  const tabButtons = document.querySelectorAll('.tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-tab');
      state.activeTab = targetId;

      // Стили кнопок
      tabButtons.forEach(b => {
        b.classList.remove('active', 'border-emerald-400', 'text-emerald-400', 'bg-slate-800/40');
        b.classList.add('border-transparent', 'text-slate-400');
      });
      btn.classList.add('active', 'border-emerald-400', 'text-emerald-400', 'bg-slate-800/40');
      btn.classList.remove('border-transparent', 'text-slate-400');

      // Переключение содержимого
      document.querySelectorAll('.tab-content').forEach(section => {
        section.classList.add('hidden');
        section.classList.remove('block');
      });
      const targetSection = document.getElementById(targetId);
      if (targetSection) {
        targetSection.classList.remove('hidden');
        targetSection.classList.add('block');
      }

      if (window.lucide) window.lucide.createIcons();
    });
  });
}

// Фильтры и поиск
function initFilters() {
  // Текстовый поиск с задержкой (debounce)
  const searchInput = document.getElementById('records-search-input');
  let debounceTimer;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      state.page = 1;
      loadRecords();
    }, 300);
  });

  // Фильтры-пилюли
  const filterPills = document.querySelectorAll('.filter-pill');
  filterPills.forEach(pill => {
    pill.addEventListener('click', () => {
      filterPills.forEach(p => {
        p.classList.remove('active', 'bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/30');
        p.classList.add('bg-slate-800', 'text-slate-400', 'border-slate-700/60');
      });
      pill.classList.add('active', 'bg-emerald-500/20', 'text-emerald-300', 'border-emerald-500/30');
      pill.classList.remove('bg-slate-800', 'text-slate-400', 'border-slate-700/60');

      state.filter = pill.getAttribute('data-filter');
      state.page = 1;
      loadRecords();
    });
  });

  // Фильтр по слову
  const kwFilter = document.getElementById('records-keyword-filter');
  kwFilter.addEventListener('change', (e) => {
    state.keywordFilter = e.target.value;
    state.page = 1;
    loadRecords();
  });

  // Пагинация
  document.getElementById('btn-page-prev').addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadRecords();
    }
  });

  document.getElementById('btn-page-next').addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadRecords();
    }
  });

  // Фильтры категорий каталога 100 слов
  const catChips = document.querySelectorAll('.category-chip');
  catChips.forEach(chip => {
    chip.addEventListener('click', () => {
      catChips.forEach(c => {
        c.classList.remove('active', 'bg-slate-800', 'text-white', 'border-slate-700');
        c.classList.add('bg-slate-900', 'text-slate-400', 'border-slate-800');
      });
      chip.classList.add('active', 'bg-slate-800', 'text-white', 'border-slate-700');
      chip.classList.remove('bg-slate-900', 'text-slate-400', 'border-slate-800');

      state.selectedCategory = chip.getAttribute('data-cat');
      renderKeywordsGrid();
    });
  });
}

// Кнопки управления и действия
function initControls() {
  // Экспорт форматированного Excel (.xlsx) с автоподбором колонок и переносом строк
  const downloadXlsx = () => {
    window.location.href = '/api/export/xlsx';
    showToast('Скачивание красивой таблицы Excel (.xlsx)...', 'success');
  };

  const btnHeaderXlsx = document.getElementById('btn-quick-export-xlsx');
  if (btnHeaderXlsx) btnHeaderXlsx.addEventListener('click', downloadXlsx);

  const btnTableXlsx = document.getElementById('btn-table-export-xlsx');
  if (btnTableXlsx) btnTableXlsx.addEventListener('click', downloadXlsx);

  // Экспорт CSV
  const btnCsv = document.getElementById('btn-quick-export-csv');
  if (btnCsv) {
    btnCsv.addEventListener('click', () => {
      window.location.href = '/api/export/csv';
      showToast('Выгрузка CSV начата', 'success');
    });
  }

  // Экспорт JSON
  const btnJson = document.getElementById('btn-quick-export-json');
  if (btnJson) {
    btnJson.addEventListener('click', () => {
      window.location.href = '/api/export/json';
      showToast('Выгрузка JSON начата', 'success');
    });
  }

  // Копировать все телефоны в буфер
  document.getElementById('btn-copy-all-phones').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/records?limit=1000');
      const data = await res.json();
      if (data.records) {
        const allPhones = [];
        data.records.forEach(r => {
          if (Array.isArray(r.phones)) {
            r.phones.forEach(p => allPhones.push(p));
          }
        });
        const unique = Array.from(new Set(allPhones));
        if (unique.length === 0) {
          showToast('В базе пока нет телефонов', 'warning');
        } else {
          copyToClipboard(unique.join('\n'), `Скопировано ${unique.length} телефонов`);
        }
      }
    } catch (e) {
      showToast('Ошибка при экспорте телефонов', 'error');
    }
  });

  // Очистка всех записей
  document.getElementById('btn-clear-all-records').addEventListener('click', async () => {
    if (confirm('Вы действительно хотите удалить все собранные данные из базы?')) {
      try {
        await fetch('/api/records/all', { method: 'DELETE' });
        showToast('База данных успешно очищена', 'info');
        loadStats();
        loadRecords();
        loadLogs();
      } catch (e) {
        showToast('Ошибка очистки базы', 'error');
      }
    }
  });

  // Управление автопоиском: Запуск
  document.getElementById('btn-queue-start').addEventListener('click', async () => {
    const depth = parseInt(document.getElementById('setting-depth').value, 10);
    const delay = parseInt(document.getElementById('setting-delay').value, 10);
    const deepScan = document.getElementById('setting-deep-scan').checked;
    const scope = document.getElementById('setting-keywords-scope').value;

    let keywordsToSearch = [];
    if (scope === 'all') {
      keywordsToSearch = state.keywords.filter(k => k.active === 1);
    } else if (scope === 'catering') {
      keywordsToSearch = state.keywords.filter(k => k.active === 1 && k.category === 'Заведения и общепит');
    } else if (scope === 'delivery') {
      keywordsToSearch = state.keywords.filter(k => k.active === 1 && k.category === 'Доставка и кейтеринг');
    } else if (scope === 'products') {
      keywordsToSearch = state.keywords.filter(k => k.active === 1 && k.category === 'Продукты и фермы');
    } else if (scope === 'desserts') {
      keywordsToSearch = state.keywords.filter(k => k.active === 1 && k.category === 'Блюда и десерты');
    }

    try {
      const res = await fetch('/api/queue/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywords: keywordsToSearch, depth, delay, deepScan })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Автопоиск запущен для ${data.total} ключевых слов!`, 'success');
        pollQueueStatus();
      } else {
        showToast(data.error || 'Не удалось запустить автопоиск', 'error');
      }
    } catch (e) {
      showToast('Ошибка связи с сервером', 'error');
    }
  });

  // Управление автопоиском: Пауза
  document.getElementById('btn-queue-pause').addEventListener('click', async () => {
    try {
      const isPaused = document.getElementById('btn-queue-pause').textContent.includes('Возобновить');
      const endpoint = isPaused ? '/api/queue/resume' : '/api/queue/pause';
      const res = await fetch(endpoint, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast(isPaused ? 'Поиск возобновлен' : 'Поиск на паузе', 'info');
        pollQueueStatus();
      }
    } catch (e) {
      showToast('Ошибка при переключении паузы', 'error');
    }
  });

  // Управление автопоиском: Стоп
  document.getElementById('btn-queue-stop').addEventListener('click', async () => {
    try {
      const res = await fetch('/api/queue/stop', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        showToast('Остановка очереди запрошена', 'warning');
        pollQueueStatus();
      }
    } catch (e) {
      showToast('Ошибка остановки', 'error');
    }
  });

  // Обновить логи
  document.getElementById('btn-refresh-logs').addEventListener('click', () => {
    loadLogs();
    showToast('Логи обновлены', 'info');
  });

  // Добавление ключевого слова
  document.getElementById('btn-add-keyword').addEventListener('click', async () => {
    const input = document.getElementById('new-keyword-input');
    const word = input.value.trim();
    if (!word) {
      showToast('Введите поисковое слово или фразу', 'warning');
      return;
    }

    try {
      const res = await fetch('/api/keywords', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ word, category: 'Пользовательские' })
      });
      const data = await res.json();
      if (data.success) {
        input.value = '';
        showToast(`Слово "${word}" успешно добавлено`, 'success');
        loadKeywords();
        loadStats();
      } else {
        showToast(data.error || 'Ошибка добавления', 'error');
      }
    } catch (e) {
      showToast('Ошибка соединения', 'error');
    }
  });

  // Быстрый ручной поиск
  document.getElementById('btn-manual-search').addEventListener('click', async () => {
    const input = document.getElementById('manual-search-query');
    const depth = parseInt(document.getElementById('manual-search-depth').value, 10);
    const query = input.value.trim();
    const btn = document.getElementById('btn-manual-search');

    if (!query) {
      showToast('Введите поисковый запрос или URL сайта', 'warning');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i data-lucide="loader" class="w-4 h-4 animate-spin"></i><span>Идет сбор данных...</span>`;
    if (window.lucide) window.lucide.createIcons();

    const resultBox = document.getElementById('manual-result-box');
    const resultContent = document.getElementById('manual-result-content');
    resultBox.classList.remove('hidden');
    resultContent.innerHTML = '<div class="text-slate-400">Отправка запроса в поисковик и анализ сайтов... Пожалуйста, подождите 3-10 секунд...</div>';

    try {
      const res = await fetch('/api/search/single', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, depth })
      });
      const data = await res.json();

      if (data.success && data.records && data.records.length > 0) {
        showToast(`Собрано ${data.records.length} сайтов!`, 'success');
        let html = '';
        data.records.forEach(r => {
          const phones = r.phones.length ? `📞 ${r.phones.join(', ')}` : '📞 Нет телефона';
          const emails = r.emails.length ? `✉️ ${r.emails.join(', ')}` : '✉️ Нет email';
          html += `
            <div class="p-3 bg-slate-900 border border-slate-800 rounded-lg flex flex-col space-y-1">
              <div class="flex items-center justify-between">
                <a href="${r.url}" target="_blank" class="text-emerald-400 hover:underline font-bold">${r.title || r.domain}</a>
                <span class="text-[10px] text-slate-500">${r.domain}</span>
              </div>
              <div class="text-slate-300 text-xs">${phones} | ${emails}</div>
              <div class="text-slate-400 text-[11px] truncate">${r.description || r.content_summary}</div>
            </div>
          `;
        });
        resultContent.innerHTML = html;
        loadStats();
        loadRecords();
      } else {
        resultContent.innerHTML = '<div class="text-amber-400">Сайты найдены, но контактных данных на страницах не обнаружено, либо сработал антибот.</div>';
      }
    } catch (e) {
      resultContent.innerHTML = `<div class="text-red-400">Ошибка сбора: ${e.message}</div>`;
      showToast('Ошибка выполнения запроса', 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i data-lucide="search" class="w-4 h-4"></i><span>Собрать данные</span>`;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}

// Загрузка статистики
async function loadStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    if (data.success && data.stats) {
      const s = data.stats;
      document.getElementById('stat-total-records').textContent = s.totalRecords.toLocaleString();
      document.getElementById('stat-unique-domains').textContent = `доменов: ${s.uniqueDomains}`;
      document.getElementById('stat-with-phone').textContent = s.withPhone.toLocaleString();
      document.getElementById('stat-with-email').textContent = s.withEmail.toLocaleString();
      document.getElementById('stat-with-socials').textContent = s.withSocials.toLocaleString();
      document.getElementById('stat-total-keywords').textContent = s.totalKeywords;
      document.getElementById('stat-searched-keywords').textContent = `пройдено: ${s.searchedKeywords}`;
    }
  } catch (e) {
    console.error('Ошибка загрузки статистики:', e);
  }
}

// Мониторинг статуса очереди (автосбора)
async function pollQueueStatus() {
  try {
    const res = await fetch('/api/queue/status');
    const data = await res.json();
    if (data.success && data.status) {
      const q = data.status;
      updateQueueUI(q);
    }
  } catch (e) {
    console.error('Ошибка опроса очереди:', e);
  }
}

// Обновление интерфейса очереди
function updateQueueUI(q) {
  const statusDot = document.getElementById('status-indicator-dot');
  const statusText = document.getElementById('status-indicator-text');
  const btnStart = document.getElementById('btn-queue-start');
  const btnPause = document.getElementById('btn-queue-pause');
  const btnStop = document.getElementById('btn-queue-stop');
  const progressBar = document.getElementById('queue-progress-bar');
  const progressText = document.getElementById('queue-progress-text');
  const currentAction = document.getElementById('queue-current-action');

  if (q.status === 'running') {
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-emerald-400 pulsing-indicator';
    statusText.textContent = `Сбор данных: "${q.currentKeyword || 'запрос'}"`;
    btnStart.disabled = true;
    btnStart.classList.add('opacity-50');
    btnPause.disabled = false;
    btnPause.innerHTML = `<i data-lucide="pause" class="w-4 h-4"></i><span>Пауза</span>`;
    btnStop.disabled = false;

    currentAction.textContent = q.currentSite ? `Парсинг сайта: ${q.currentSite}` : `Поиск по запросу "${q.currentKeyword}"`;
    // Если что-то собрано, периодически обновляем базу
    if (Math.random() > 0.6) {
      loadRecords(true);
      loadStats();
    }
  } else if (q.status === 'paused') {
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-amber-400';
    statusText.textContent = 'Очередь на паузе';
    btnStart.disabled = true;
    btnPause.disabled = false;
    btnPause.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i><span>Возобновить</span>`;
    btnStop.disabled = false;
    currentAction.textContent = 'Сбор приостановлен пользователем';
  } else if (q.status === 'finished') {
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-cyan-400';
    statusText.textContent = `Завершено! Найдено ${q.totalFound} сайтов`;
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50');
    btnPause.disabled = true;
    btnStop.disabled = true;
    currentAction.textContent = `Автопоиск успешно завершен. Всего сайтов: ${q.totalFound}`;
    loadRecords();
    loadStats();
    loadLogs();
  } else {
    // idle / stopped
    statusDot.className = 'w-2.5 h-2.5 rounded-full bg-slate-500';
    statusText.textContent = 'Ожидание команд';
    btnStart.disabled = false;
    btnStart.classList.remove('opacity-50');
    btnPause.disabled = true;
    btnStop.disabled = true;
    currentAction.textContent = 'Ожидание запуска автопоиска...';
  }

  progressBar.style.width = `${q.progressPercent || 0}%`;
  progressText.textContent = `${q.currentKeywordIndex} / ${q.totalKeywords} ключевых слов (${q.progressPercent}%)`;

  if (window.lucide) window.lucide.createIcons();
}

// Загрузка таблицы записей
async function loadRecords(silent = false) {
  const tbody = document.getElementById('records-table-body');
  if (!silent) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-500">
          <div class="flex items-center justify-center space-y-2">
            <i data-lucide="loader" class="w-6 h-6 animate-spin text-emerald-400"></i>
            <span class="ml-2 text-sm text-slate-400">Загрузка данных...</span>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) window.lucide.createIcons();
  }

  const queryParams = new URLSearchParams({
    page: state.page,
    limit: state.limit,
    search: state.searchQuery,
    filter: state.filter,
    keyword: state.keywordFilter
  });

  try {
    const res = await fetch(`/api/records?${queryParams}`);
    const data = await res.json();

    if (data.success) {
      state.totalPages = data.totalPages;
      state.totalRecords = data.total;
      renderRecordsTable(data.records);
      updatePaginationUI();
    }
  } catch (e) {
    console.error('Ошибка загрузки записей:', e);
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-red-400">Ошибка загрузки: ${e.message}</td></tr>`;
  }
}

// Рендеринг таблицы записей
function renderRecordsTable(records) {
  const tbody = document.getElementById('records-table-body');
  if (!records || records.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="py-12 text-center text-slate-500">
          <div class="flex flex-col items-center justify-center space-y-2">
            <i data-lucide="inbox" class="w-8 h-8 text-slate-600"></i>
            <span>По вашему запросу ничего не найдено. Попробуйте изменить фильтры или запустить автопоиск.</span>
          </div>
        </td>
      </tr>
    `;
    if (window.lucide) window.lucide.createIcons();
    return;
  }

  let rowsHtml = '';
  records.forEach((r, index) => {
    const rowNum = (state.page - 1) * state.limit + index + 1;

    // Телефоны
    let phonesHtml = '<span class="text-slate-500 italic text-[11px]">Телефон не найден</span>';
    if (r.phones && r.phones.length > 0) {
      phonesHtml = r.phones.slice(0, 2).map(p => `
        <div class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px] copy-badge cursor-pointer" onclick="copyToClipboard('${p}', 'Телефон')">
          <i data-lucide="phone" class="w-3 h-3"></i>
          <span>${p}</span>
          <i data-lucide="copy" class="w-2.5 h-2.5 opacity-60"></i>
        </div>
      `).join(' ');
      if (r.phones.length > 2) {
        phonesHtml += ` <span class="text-[10px] text-slate-400 cursor-pointer" onclick="openRecordModal(${r.id})">+${r.phones.length - 2}</span>`;
      }
    }

    // Email
    let emailsHtml = '';
    if (r.emails && r.emails.length > 0) {
      emailsHtml = r.emails.slice(0, 1).map(em => `
        <div class="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 text-[11px] copy-badge cursor-pointer" onclick="copyToClipboard('${em}', 'Email')">
          <i data-lucide="mail" class="w-3 h-3"></i>
          <span class="max-w-[140px] truncate">${em}</span>
          <i data-lucide="copy" class="w-2.5 h-2.5 opacity-60"></i>
        </div>
      `).join(' ');
      if (r.emails.length > 1) {
        emailsHtml += ` <span class="text-[10px] text-slate-400 cursor-pointer" onclick="openRecordModal(${r.id})">+${r.emails.length - 1}</span>`;
      }
    }

    // Мессенджеры
    let socialsHtml = '';
    const tg = r.socials?.telegram || [];
    const wa = r.socials?.whatsapp || [];
    const vk = r.socials?.vk || [];

    if (tg.length > 0) {
      socialsHtml += `<a href="${tg[0]}" target="_blank" title="Telegram" class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[10px] font-semibold border border-blue-500/30 hover:bg-blue-500/30">TG</a> `;
    }
    if (wa.length > 0) {
      socialsHtml += `<a href="${wa[0]}" target="_blank" title="WhatsApp" class="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px] font-semibold border border-green-500/30 hover:bg-green-500/30">WA</a> `;
    }
    if (vk.length > 0) {
      socialsHtml += `<a href="${vk[0]}" target="_blank" title="ВКонтакте" class="px-1.5 py-0.5 bg-sky-500/20 text-sky-400 rounded text-[10px] font-semibold border border-sky-500/30 hover:bg-sky-500/30">VK</a>`;
    }

    // Сниппет содержимого (что собрано)
    const summaryText = r.description || r.content_summary || 'Описание отсутствует';
    const cleanSummary = summaryText.length > 95 ? summaryText.slice(0, 95) + '...' : summaryText;

    rowsHtml += `
      <tr class="record-row hover:bg-slate-800/40 transition-colors">
        <td class="py-3 px-4 text-center font-mono text-slate-500 text-[11px]">${rowNum}</td>
        
        <!-- Сайт и ссылка -->
        <td class="py-3 px-4">
          <div class="flex flex-col space-y-0.5">
            <span class="font-bold text-slate-200 hover:text-emerald-400 transition-colors cursor-pointer truncate max-w-[220px]" onclick="openRecordModal(${r.id})">
              ${r.title || r.domain}
            </span>
            <div class="flex items-center space-x-1.5">
              <a href="${r.url}" target="_blank" class="text-[11px] text-emerald-400/80 hover:text-emerald-300 hover:underline flex items-center space-x-1 truncate max-w-[190px]">
                <span>${r.domain}</span>
                <i data-lucide="external-link" class="w-2.5 h-2.5 inline"></i>
              </a>
            </div>
          </div>
        </td>

        <!-- Контакты -->
        <td class="py-3 px-4">
          <div class="flex flex-col space-y-1">
            <div class="flex flex-wrap items-center gap-1">${phonesHtml}</div>
            <div class="flex flex-wrap items-center gap-1">${emailsHtml} ${socialsHtml}</div>
          </div>
        </td>

        <!-- Что собрано -->
        <td class="py-3 px-4">
          <p class="text-slate-400 text-[11px] leading-relaxed cursor-pointer hover:text-slate-200" onclick="openRecordModal(${r.id})">
            ${cleanSummary}
          </p>
        </td>

        <!-- Запрос -->
        <td class="py-3 px-4">
          <span class="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-medium inline-block max-w-[130px] truncate">
            ${r.keyword || 'Автопоиск'}
          </span>
        </td>

        <!-- Дата -->
        <td class="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
          ${r.collected_at}
        </td>

        <!-- Действия -->
        <td class="py-3 px-4 text-center">
          <div class="flex items-center justify-center space-x-1">
            <button onclick="openRecordModal(${r.id})" title="Подробнее" class="p-1 hover:bg-slate-700 text-slate-400 hover:text-white rounded transition-colors">
              <i data-lucide="eye" class="w-4 h-4"></i>
            </button>
            <button onclick="deleteRecordItem(${r.id})" title="Удалить" class="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition-colors">
              <i data-lucide="trash" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = rowsHtml;
  if (window.lucide) window.lucide.createIcons();
}

// Обновление пагинации
function updatePaginationUI() {
  const info = document.getElementById('pagination-info');
  const pageDisp = document.getElementById('pagination-current-page');
  const btnPrev = document.getElementById('btn-page-prev');
  const btnNext = document.getElementById('btn-page-next');

  info.textContent = `Показано ${state.totalRecords > 0 ? (state.page - 1) * state.limit + 1 : 0} - ${Math.min(state.page * state.limit, state.totalRecords)} из ${state.totalRecords} записей`;
  pageDisp.textContent = `${state.page} / ${state.totalPages}`;

  btnPrev.disabled = state.page <= 1;
  btnNext.disabled = state.page >= state.totalPages;
}

// Удаление записи
async function deleteRecordItem(id) {
  if (confirm('Удалить эту запись?')) {
    try {
      const res = await fetch(`/api/records/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        showToast('Запись удалена', 'info');
        loadRecords();
        loadStats();
      }
    } catch (e) {
      showToast('Ошибка удаления', 'error');
    }
  }
}

// Загрузка ключевых слов (каталог 100 слов)
async function loadKeywords() {
  try {
    const res = await fetch('/api/keywords');
    const data = await res.json();
    if (data.success && data.keywords) {
      state.keywords = data.keywords;
      renderKeywordsGrid();
      populateKeywordFilterSelect();
    }
  } catch (e) {
    console.error('Ошибка загрузки ключевых слов:', e);
  }
}

// Заполнение выпадающего списка ключевых слов в фильтрах
function populateKeywordFilterSelect() {
  const select = document.getElementById('records-keyword-filter');
  const curVal = select.value;
  select.innerHTML = '<option value="">Все ключевые слова</option>';
  state.keywords.forEach(kw => {
    const opt = document.createElement('option');
    opt.value = kw.word;
    opt.textContent = `${kw.word} (${kw.total_found || 0})`;
    select.appendChild(opt);
  });
  select.value = curVal;
}

// Рендеринг сетки ключевых слов
function renderKeywordsGrid() {
  const grid = document.getElementById('keywords-grid');
  if (!grid) return;

  const filtered = state.selectedCategory === 'all' 
    ? state.keywords 
    : state.keywords.filter(k => k.category === state.selectedCategory);

  let html = '';
  filtered.forEach(kw => {
    const isActive = kw.active === 1;
    const badgeColor = kw.total_found > 0 
      ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' 
      : 'bg-slate-800 text-slate-500 border-slate-700';

    html += `
      <div class="bg-slate-900/70 border ${isActive ? 'border-slate-800' : 'border-slate-800/50 opacity-60'} rounded-xl p-3 flex flex-col justify-between hover:border-slate-700 transition-all">
        <div class="flex items-start justify-between gap-2 mb-2">
          <div class="flex items-center space-x-2">
            <input type="checkbox" ${isActive ? 'checked' : ''} onchange="toggleKeywordItem(${kw.id}, this.checked)" class="rounded bg-slate-950 border-slate-700 text-emerald-500 focus:ring-0 cursor-pointer">
            <span class="font-semibold text-xs text-slate-200 leading-snug">${kw.word}</span>
          </div>
          <button onclick="quickSearchOneKeyword('${kw.word.replace(/'/g, "\\'")}')" title="Быстро найти в поисковике" class="p-1 hover:bg-slate-800 text-slate-400 hover:text-emerald-400 rounded transition-colors">
            <i data-lucide="play" class="w-3.5 h-3.5"></i>
          </button>
        </div>
        
        <div class="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/60">
          <span class="text-slate-500 text-[10px]">${kw.category}</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-bold border ${badgeColor}">
            ${kw.total_found || 0} сайтов
          </span>
        </div>
      </div>
    `;
  });

  grid.innerHTML = html;
  if (window.lucide) window.lucide.createIcons();
}

// Быстрый поиск по одному слову из каталога
async function quickSearchOneKeyword(word) {
  showToast(`Запуск сбора по слову: "${word}"...`, 'info');
  try {
    const res = await fetch('/api/search/single', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: word, depth: 5 })
    });
    const data = await res.json();
    if (data.success) {
      showToast(`Найдено и сохранено: ${data.records.length} сайтов по слову "${word}"`, 'success');
      loadStats();
      loadRecords();
      loadKeywords();
      loadLogs();
    }
  } catch (e) {
    showToast('Ошибка при поиске слова', 'error');
  }
}

// Переключение активности слова
async function toggleKeywordItem(id, active) {
  try {
    await fetch('/api/keywords/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, active })
    });
    const item = state.keywords.find(k => k.id === id);
    if (item) item.active = active ? 1 : 0;
  } catch (e) {
    showToast('Ошибка переключения', 'error');
  }
}

// Загрузка логов
async function loadLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    if (data.success && data.logs) {
      renderLogs(data.logs);
    }
  } catch (e) {
    console.error('Ошибка логов:', e);
  }
}

// Рендеринг логов
function renderLogs(logs) {
  const container = document.getElementById('logs-container');
  if (!container) return;

  if (logs.length === 0) {
    container.innerHTML = '<div class="text-slate-500">// Журнал логов пуст. Запустите автопоиск.</div>';
    return;
  }

  let html = '';
  logs.forEach(log => {
    let colorClass = 'text-slate-300';
    let icon = 'ℹ️';

    if (log.level === 'SUCCESS') {
      colorClass = 'text-emerald-400 font-medium';
      icon = '✅';
    } else if (log.level === 'WARN') {
      colorClass = 'text-amber-400';
      icon = '⚠️';
    } else if (log.level === 'ERROR') {
      colorClass = 'text-red-400 font-bold';
      icon = '❌';
    }

    html += `
      <div class="flex items-start space-x-2 leading-tight">
        <span class="text-slate-600 text-[10px] select-none whitespace-nowrap">[${log.timestamp.split(',')[1]?.trim() || log.timestamp}]</span>
        <span class="select-none">${icon}</span>
        <span class="${colorClass} break-all">${log.message}</span>
      </div>
    `;
  });

  container.innerHTML = html;
}

// Модальное окно просмотра сайта
function initModal() {
  const modal = document.getElementById('record-modal');
  const btnClose = document.getElementById('modal-btn-close');
  const btnCloseBottom = document.getElementById('modal-btn-close-bottom');

  const close = () => {
    modal.classList.add('hidden');
    state.activeModalRecord = null;
  };

  btnClose.addEventListener('click', close);
  btnCloseBottom.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });

  // Удаление из модалки
  document.getElementById('modal-btn-delete').addEventListener('click', () => {
    if (state.activeModalRecord) {
      deleteRecordItem(state.activeModalRecord.id);
      close();
    }
  });
}

// Открытие модалки записи
async function openRecordModal(id) {
  try {
    const res = await fetch(`/api/records?search=&limit=1`);
    // Ищем запись в текущей выборке или загружаем
    const recordRes = await fetch(`/api/records?limit=1000`);
    const data = await recordRes.json();
    const record = data.records.find(r => r.id === id);

    if (!record) {
      showToast('Запись не найдена', 'warning');
      return;
    }

    state.activeModalRecord = record;

    document.getElementById('modal-site-title').textContent = record.title || record.domain;
    document.getElementById('modal-site-url').textContent = record.url;
    document.getElementById('modal-site-link').href = record.url;
    document.getElementById('modal-keyword').textContent = record.keyword || 'Автопоиск';
    document.getElementById('modal-date').textContent = record.collected_at;
    document.getElementById('modal-content-summary').textContent = record.content_summary || record.description || 'Текстовый контент не был извлечен';

    // Телефоны
    const phonesList = document.getElementById('modal-phones-list');
    if (record.phones && record.phones.length > 0) {
      phonesList.innerHTML = record.phones.map(p => `
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-emerald-400 font-mono">${p}</span>
          <button onclick="copyToClipboard('${p}', 'Телефон')" class="text-slate-400 hover:text-white px-2 py-0.5 rounded text-[10px] bg-slate-800">Копировать</button>
        </div>
      `).join('');
    } else {
      phonesList.innerHTML = '<span class="text-slate-500 italic">Телефоны не найдены</span>';
    }

    // Email
    const emailsList = document.getElementById('modal-emails-list');
    if (record.emails && record.emails.length > 0) {
      emailsList.innerHTML = record.emails.map(em => `
        <div class="flex items-center justify-between p-1.5 rounded-lg bg-slate-900 border border-slate-800">
          <span class="text-cyan-400 font-mono truncate max-w-[160px]">${em}</span>
          <button onclick="copyToClipboard('${em}', 'Email')" class="text-slate-400 hover:text-white px-2 py-0.5 rounded text-[10px] bg-slate-800">Копировать</button>
        </div>
      `).join('');
    } else {
      emailsList.innerHTML = '<span class="text-slate-500 italic">Email не найден</span>';
    }

    // Соцсети и мессенджеры
    const socialsList = document.getElementById('modal-socials-list');
    const s = record.socials || {};
    let socialsHtml = '';

    if (s.telegram && s.telegram.length) {
      s.telegram.forEach(tg => {
        socialsHtml += `<a href="${tg}" target="_blank" class="px-2.5 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-lg flex items-center space-x-1 hover:bg-blue-500/30"><span>✈️ ${tg.replace('https://t.me/', '@')}</span></a>`;
      });
    }
    if (s.whatsapp && s.whatsapp.length) {
      s.whatsapp.forEach(wa => {
        socialsHtml += `<a href="${wa}" target="_blank" class="px-2.5 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded-lg flex items-center space-x-1 hover:bg-green-500/30"><span>🟢 WhatsApp</span></a>`;
      });
    }
    if (s.vk && s.vk.length) {
      s.vk.forEach(v => {
        socialsHtml += `<a href="${v}" target="_blank" class="px-2.5 py-1 bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded-lg flex items-center space-x-1 hover:bg-sky-500/30"><span>🔷 ВКонтакте</span></a>`;
      });
    }

    if (!socialsHtml) {
      socialsList.innerHTML = '<span class="text-slate-500 italic">Мессенджеры не указаны</span>';
    } else {
      socialsList.innerHTML = socialsHtml;
    }

    const modal = document.getElementById('record-modal');
    modal.classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  } catch (e) {
    showToast('Ошибка открытия карточки', 'error');
  }
}

// Экспорт глобальных функций для вызова из inline onclick
window.copyToClipboard = copyToClipboard;
window.openRecordModal = openRecordModal;
window.deleteRecordItem = deleteRecordItem;
window.toggleKeywordItem = toggleKeywordItem;
window.quickSearchOneKeyword = quickSearchOneKeyword;
