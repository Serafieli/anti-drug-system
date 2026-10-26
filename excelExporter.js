// antidrugsystem - Генератор нативных форматированных таблиц Excel (.xlsx)
// Без внешних зависимостей, на чистом node:zlib
const zlib = require('node:zlib');

// Таблица CRC32
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  }
  crcTable[i] = c;
}

function crc32(buf) {
  let crc = 0 ^ (-1);
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
  }
  return (crc ^ (-1)) >>> 0;
}

// Создание чистого ZIP-контейнера для OpenXML
function createZipBuffer(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  for (const file of files) {
    const filenameBuf = Buffer.from(file.name, 'utf8');
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const compressed = zlib.deflateRawSync(contentBuf);
    const crc = crc32(contentBuf);

    // Local file header
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Сигнатура
    localHeader.writeUInt16LE(20, 4);         // Версия (2.0)
    localHeader.writeUInt16LE(0x0800, 6);     // Флаг UTF-8
    localHeader.writeUInt16LE(8, 8);          // Метод сжатия (Deflate)
    localHeader.writeUInt16LE(0, 10);         // Время
    localHeader.writeUInt16LE(0, 12);         // Дата
    localHeader.writeUInt32LE(crc, 14);       // Контрольная сумма CRC-32
    localHeader.writeUInt32LE(compressed.length, 18);
    localHeader.writeUInt32LE(contentBuf.length, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    filenameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressed);

    // Central directory header
    const centralHeader = Buffer.alloc(46 + filenameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Сигнатура
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressed.length, 20);
    centralHeader.writeUInt32LE(contentBuf.length, 24);
    centralHeader.writeUInt16LE(filenameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    filenameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressed.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const ch of centralHeaders) centralDirSize += ch.length;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

// Экранирование спецсимволов XML и удаление недопустимых управляющих символов
function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // удаление непечатаемых символов
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Очистка длинного текста описания от разрывов и мусора
function cleanDescription(text, maxLen = 350) {
  if (!text) return '';
  const cleaned = text
    .replace(/\r?\n+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return cleaned.slice(0, maxLen - 3) + '...';
}

// Основная функция генерации нативного Excel (.xlsx)
function generateFormattedXlsx(records) {
  // 1. [Content_Types].xml
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  // 2. _rels/.rels
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  // 3. xl/_rels/workbook.xml.rels
  const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  // 4. xl/workbook.xml
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Контакты и Данные (Еда)" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  // 5. xl/styles.xml (Стили: фиксированная ширина, перенос строк wrapText=1, акценты, шапка)
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="4">
    <!-- 0: Обычный шрифт -->
    <font><sz val="10"/><color rgb="FF1E293B"/><name val="Segoe UI"/></font>
    <!-- 1: Заголовок таблицы (Белый полужирный) -->
    <font><b/><sz val="10.5"/><color rgb="FFFFFFFF"/><name val="Segoe UI"/></font>
    <!-- 2: Акцентный полужирный зеленый (для телефонов и доменов) -->
    <font><b/><sz val="10"/><color rgb="FF047857"/><name val="Segoe UI"/></font>
    <!-- 3: Ссылка (Синий подчеркнутый) -->
    <font><u/><sz val="9.5"/><color rgb="FF0284C7"/><name val="Segoe UI"/></font>
  </fonts>
  
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <!-- 2: Темно-синяя шапка (#0F172A) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F172A"/></patternFill></fill>
    <!-- 3: Мягкая зебра (#F8FAFC) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFF8FAFC"/></patternFill></fill>
    <!-- 4: Легкая подсветка контактов (#ECFDF5) -->
    <fill><patternFill patternType="solid"><fgColor rgb="FFECFDF5"/></patternFill></fill>
  </fills>

  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <!-- 1: Тонкая аккуратная рамка ячеек (#E2E8F0) -->
    <border>
      <left style="thin"><color rgb="FFE2E8F0"/></left>
      <right style="thin"><color rgb="FFE2E8F0"/></right>
      <top style="thin"><color rgb="FFE2E8F0"/></top>
      <bottom style="thin"><color rgb="FFE2E8F0"/></bottom>
    </border>
  </borders>

  <cellStyleXfs count="1">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
  </cellStyleXfs>

  <cellXfs count="7">
    <!-- 0: Стандарт по умолчанию -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>

    <!-- 1: Шапка таблицы (темный фон, белый текст, центр, перенос слов) -->
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="center" wrapText="1"/>
    </xf>

    <!-- 2: Обычная строка (белый фон, выравнивание по верху, автоперенос wrapText=1) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>

    <!-- 3: Зебра-строка (светло-серый фон #F8FAFC, автоперенос wrapText=1) -->
    <xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>

    <!-- 4: Центрированная ячейка (ID, дата) -->
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="center" vertical="top"/>
    </xf>

    <!-- 5: Контакты с зеленой подсветкой (телефоны/почта) -->
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>

    <!-- 6: Ссылка кликабельная -->
    <xf numFmtId="0" fontId="3" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">
      <alignment horizontal="left" vertical="top" wrapText="1"/>
    </xf>
  </cellXfs>
</styleSheet>`;

  // 6. Конфигурация колонок таблицы:
  // Идеально подобранная ширина, чтобы строки не разъезжались и не требовалось вручную растягивать!
  const cols = [
    { name: '№', width: 6 },
    { name: 'Ключевой запрос (Еда)', width: 24 },
    { name: 'Домен сайта', width: 20 },
    { name: 'Название сайта (Title)', width: 32 },
    { name: 'Ссылка на сайт (URL)', width: 28 },
    { name: 'Найденные телефоны', width: 24 },
    { name: 'Email адреса', width: 25 },
    { name: 'Telegram', width: 18 },
    { name: 'WhatsApp', width: 18 },
    { name: 'ВКонтакте', width: 18 },
    { name: 'Что собрано (Контент / Описание)', width: 44 },
    { name: 'Дата сбора', width: 18 }
  ];

  let colsXml = '<cols>';
  cols.forEach((col, idx) => {
    colsXml += `<col min="${idx + 1}" max="${idx + 1}" width="${col.width}" customWidth="1"/>`;
  });
  colsXml += '</cols>';

  let sheetData = '<sheetData>';

  // Строка 1: Заголовок таблицы (высота 30pt)
  sheetData += '<row r="1" ht="30" customHeight="1">';
  cols.forEach((col, idx) => {
    const colLetter = getExcelCol(idx);
    sheetData += `<c r="${colLetter}1" t="inlineStr" s="1"><is><t>${escapeXml(col.name)}</t></is></c>`;
  });
  sheetData += '</row>';

  // Строки с данными
  records.forEach((r, rowIdx) => {
    const rNum = rowIdx + 2;
    const isZebra = (rowIdx % 2 === 1);
    const baseStyle = isZebra ? 3 : 2;

    const phonesStr = (r.phones || []).join('\n');
    const emailsStr = (r.emails || []).join('\n');
    const tgStr = (r.socials?.telegram || []).join('\n');
    const waStr = (r.socials?.whatsapp || []).join('\n');
    const vkStr = (r.socials?.vk || []).join('\n');
    const desc = cleanDescription(r.description || r.content_summary, 320);

    // Рассчитываем комфортную высоту строки в зависимости от объема контактов
    const maxLines = Math.max(
      1,
      (r.phones || []).length,
      (r.emails || []).length,
      Math.ceil(desc.length / 40)
    );
    const rowHeight = Math.min(Math.max(26, maxLines * 16), 75);

    const rowCells = [
      { val: r.id, style: 4 },                          // 0: № (центр)
      { val: r.keyword || 'Автопоиск', style: baseStyle }, // 1: Запрос
      { val: r.domain || '', style: baseStyle },          // 2: Домен
      { val: r.title || r.domain || '', style: baseStyle }, // 3: Заголовок
      { val: r.url || '', style: 6 },                    // 4: URL (стиль ссылки)
      { val: phonesStr || '—', style: (r.phones && r.phones.length > 0) ? 5 : baseStyle }, // 5: Телефоны (зеленый полужирный)
      { val: emailsStr || '—', style: baseStyle },        // 6: Email
      { val: tgStr || '—', style: baseStyle },            // 7: Telegram
      { val: waStr || '—', style: baseStyle },            // 8: WhatsApp
      { val: vkStr || '—', style: baseStyle },            // 9: ВКонтакте
      { val: desc || '—', style: baseStyle },             // 10: Что собрано (с wrapText)
      { val: r.collected_at || '', style: 4 }             // 11: Дата
    ];

    sheetData += `<row r="${rNum}" ht="${rowHeight}" customHeight="1">`;
    rowCells.forEach((cell, idx) => {
      const colLetter = getExcelCol(idx);
      sheetData += `<c r="${colLetter}${rNum}" t="inlineStr" s="${cell.style}"><is><t>${escapeXml(cell.val)}</t></is></c>`;
    });
    sheetData += '</row>';
  });

  sheetData += '</sheetData>';

  const lastRow = Math.max(records.length + 1, 1);
  const worksheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews>
    <sheetView tabSelected="1" workbookViewId="0">
      <!-- Закрепление верхней строки-шапки при прокрутке -->
      <pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="20"/>
  ${colsXml}
  ${sheetData}
  <!-- Автоматический выпадающий фильтр на всех колонках шапки -->
  <autoFilter ref="A1:L${lastRow}"/>
</worksheet>`;

  return createZipBuffer([
    { name: '[Content_Types].xml', content: contentTypes },
    { name: '_rels/.rels', content: rootRels },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRels },
    { name: 'xl/workbook.xml', content: workbook },
    { name: 'xl/styles.xml', content: styles },
    { name: 'xl/worksheets/sheet1.xml', content: worksheet }
  ]);
}

// Преобразование индекса 0..25 в букву Excel A..Z
function getExcelCol(index) {
  return String.fromCharCode(65 + index);
}

module.exports = {
  generateFormattedXlsx,
  cleanDescription
};
