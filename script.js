// ============================================================
// Конфигуратор ПК — логика
// ============================================================

// ===== Хранилище данных (заполняется из загруженного прайс-листа) =====
// catalog — исходные данные после загрузки, используются
// для сброса фильтров (сброс не удаляет каталог).
const catalog = {
	cpu: [],          // { name, price, socket, memoryType, tdp }
	gpu: [],          // { name, price, power }
	motherboard: [],  // { name, price, socket, memoryType }
	ram: [],          // { name, price, memoryType }
	ssd: [],          // { name, price, isM2 }
	hdd: [],          // { name, price }
	psu: [],          // { name, price, power }
	cooler: [],       // { name, price, tdp }
	case: []          // { name, price }
};

// ============================================================
// Утилиты работы со строками таблицы
// ============================================================

// Цена с НДС — последнее числовое значение в строке
function extractPrice(cells) {
	for (let i = cells.length - 1; i >= 0; i--) {
		const raw = cells[i].trim().replace(/\s/g, "").replace(",", ".");
		if (raw === "") continue;
		const n = parseFloat(raw);
		if (!isNaN(n)) return n;
	}
	return 0;
}

// Название из строки: сначала колонка "код" (артикул + имя через пробел),
// иначе первая непустая колонка с буквами (в реальном прайсе — "ПРАЙС")
function extractName(cells, codeIdx) {
	const v = (cells[codeIdx] || "").trim();
	const idx = v.indexOf(" ");
	if (idx > -1) return v.slice(idx + 1).trim();

	// В колонке "код" только артикул — ищем имя в следующих колонках
	for (let i = codeIdx + 1; i < cells.length; i++) {
		const c = (cells[i] || "").trim();
		if (/[a-zа-яё]/i.test(c)) return c;
	}
	return "";
}

// Сокет из названия и описания. Приоритет: явный Socket-, затем <сокет> в скобках,
// затем чипсет материнской платы, затем явный LGA-код, затем модель CPU
// (Ryzen/Core/Pentium/EPYC/Xeon). desc — характеристики из соседней ячейки
// (колонка C у поставщика 2), где сокет указан всегда
// ("Coffee Lake, LGA1151 v2", "сокет Intel LGA1700").
// Явный паттерн сокета имеет приоритет (чтобы "Ryzen 5 1700" не матчил LGA1700).
function extractSocket(name, desc) {
	const t = ((name || "") + " " + (desc || "")).toLowerCase();

	// 1. Явный "Socket-xxx" / "Soc-xxx" / "сокет xxx"
	const m = t.match(/(?:socket|soc|сокет)\s*(?:intel|amd)?\s*[-:]?\s*(1851|1700|1200|1151|2011-3|2011|am5|am4|sp3|sp5|tr4)/i);
	if (m) {
		const s = m[1].toLowerCase();
		if (s === "1851") return "LGA1851";
		if (s === "1700") return "LGA1700";
		if (s === "1200") return "LGA1200";
		if (s === "1151") return "LGA1151";
		if (s === "2011-3") return "LGA2011-3";
		if (s === "2011") return "LGA2011";
		if (s === "am5") return "AM5";
		if (s === "am4") return "AM4";
		if (s === "sp3") return "SP3";
		if (s === "sp5") return "SP5";
		if (s === "tr4") return "TR4";
	}

	// 2. Сокет в угловых скобках: "Процессор <AM4> ...", "Процессор <1700> ..."
	const b = t.match(/<\s*(1851|1700|1200|1151|2011-3|2011|am5|am4|sp3|sp5)\s*>/i);
	if (b) {
		const s = b[1].toLowerCase();
		if (s === "1851") return "LGA1851";
		if (s === "1700") return "LGA1700";
		if (s === "1200") return "LGA1200";
		if (s === "1151") return "LGA1151";
		if (s === "2011-3") return "LGA2011-3";
		if (s === "2011") return "LGA2011";
		if (s === "am5") return "AM5";
		if (s === "am4") return "AM4";
		if (s === "sp3") return "SP3";
		if (s === "sp5") return "SP5";
	}

	// 3. Чипсеты материнских плат -> сокет (для названий без явного сокета,
	//    например "MSI MAG B650M MORTAR WIFI mATX" — это AM5)
	if (/\b(?:b650|x670|a620|a620a|x870|b850|x870e)\b/i.test(t)) return "AM5";
	if (/\b(?:a320|b450|x470|a520|b550|x570)\b/i.test(t)) return "AM4";
	if (/\b(?:h610|b660|z690|b760|z790|h770)\b/i.test(t)) return "LGA1700";
	if (/\b(?:b860|z890)\b/i.test(t)) return "LGA1851";
	if (/\b(?:h510|b560|z590)\b/i.test(t)) return "LGA1200";

	// 4. Явные LGA-сокеты (включая старые: LGA1151/1150/1155/1156/775/2011/2066)
	const x = t.match(/\b(?:lga\s*4677|lga\s*4189|lga\s*3647|lga\s*2066|lga\s*2011\s*-?\s*3|lga\s*2011|lga\s*1851|lga\s*1700|lga\s*1200|lga\s*1151|lga\s*1150|lga\s*1155|lga\s*1156|lga\s*775)\b/i);
	if (x) return x[0].replace(/\s+/g, "").toUpperCase();

	// 5. Модель CPU
	// Модель Ryzen: 1xxx–5xxx -> AM4, 7xxx+ -> AM5 ("Ryzen 5 5500" vs "Ryzen 7 7700X")
	const ry = t.match(/\bryzen\s+\w+\s+(\d{4})/i);
	if (ry) return parseInt(ry[1][0], 10) >= 7 ? "AM5" : "AM4";
	if (/\bathlon\b/i.test(t)) return "AM4";
	// Pentium Gold: G4xxx/G5xxx -> LGA1151, G6xxx -> LGA1200, G7xxx -> LGA1700
	const pt = t.match(/\bpentium\s+(?:gold\s+)?g(\d)\d{3}/i);
	if (pt) {
		const g = parseInt(pt[1], 10);
		if (g >= 7) return "LGA1700";
		if (g >= 6) return "LGA1200";
		return "LGA1151";
	}
	// Модель Intel Core: i*-10xxx/11xxx -> LGA1200, i*-12xxx+ -> LGA1700
	// (суффикс K/F/T после номера модели, напр. "i5-12400F")
	const core = t.match(/\bcore\s*i[3579]-(\d{2})\d{3}[a-z]?\b/i);
	if (core) {
		const gen = parseInt(core[1], 10);
		if (gen >= 12) return "LGA1700";
		if (gen >= 10) return "LGA1200";
	}
	if (/\bcore\s*ultra\b/i.test(t)) return "LGA1851";
	// EPYC: 9xxx -> SP5, 7xxx -> SP3
	const ep = t.match(/\bepyc\s*(\d)/i);
	if (ep) return parseInt(ep[1], 10) >= 9 ? "SP5" : "SP3";
	// Xeon по модели: 44xx-65xx -> LGA4677, 43/53/63/83xx -> LGA4189,
	// 34/52/62/82/92xx -> LGA3647
	const xe = t.match(/\bxeon\s+(?:gold|silver|platinum|bronze)?\s*(\d{2})(\d{2})\b/i);
	if (xe) {
		const fam = parseInt(xe[1], 10);
		if (fam === 44 || fam === 45 || fam === 46 || fam === 64 || fam === 65) return "LGA4677";
		if (fam === 43 || fam === 53 || fam === 63 || fam === 83) return "LGA4189";
		if (fam === 34 || fam === 52 || fam === 62 || fam === 82 || fam === 92) return "LGA3647";
	}

	// 6. Запасной вариант для прайсов без явного указания сокета
	if (/\b1700\b/i.test(t)) return "LGA1700";
	if (/\b1851\b/i.test(t)) return "LGA1851";
	if (/\b1200\b/i.test(t)) return "LGA1200";
	if (/\b1151\b/i.test(t)) return "LGA1151";
	if (/\bam5\b/i.test(t)) return "AM5";
	if (/\bam4\b/i.test(t)) return "AM4";
	return null;
}

// Поколение памяти по сокету процессора/платы.
// LGA1700 — "ANY": платы бывают и DDR4, и DDR5 (проверяется по названию).
function memoryTypeFromSocket(socket) {
	if (socket === "AM5") return "DDR5";
	if (socket === "LGA1851" || socket === "SP5" || socket === "LGA4677") return "DDR5";
	if (socket === "LGA1700") return "ANY";
	if (socket === "AM4" || socket === "LGA1200" || socket === "SP3" || socket === "LGA4189" || socket === "LGA3647" ||
		socket === "LGA1151" || socket === "LGA1150" || socket === "LGA1155" || socket === "LGA1156" ||
		socket === "LGA775" || socket === "LGA2011" || socket === "LGA2011-3" || socket === "LGA2066" ||
		socket === "TR4" || socket === "sTRX4" || socket === "sWRX8") return "DDR4";
	return null;
}

// TDP процессора из названия (например "65W", "105W", "170W").
// Берём максимальное значение на случай "65W/88W" (PL1/PL2 у Intel).
function extractCPU_TDP(name) {
	const matches = name.match(/(\d+)\s*W\b/gi);
	if (!matches) return null;
	return Math.max(...matches.map(m => parseInt(m, 10)));
}

// TDP кулера из названия: "TDP 220W", "TDP 300W", "65W TDP" или просто "95W".
// Если TDP не указан (например, некоторые СЖО) — возвращаем null (считаем подходящим).
function extractCoolerTDP(name) {
	let m = name.match(/tdp\s*(\d+)\s*w/i);
	if (!m) m = name.match(/(\d+)\s*w\s*tdp/i);
	if (!m) m = name.match(/(\d+)\s*W\b/i);
	return m ? parseInt(m[1], 10) : null;
}

// Потребление видеокарты (Вт) по модели из названия.
// Реальные значения нет в прайсе, поэтому используем справочную таблицу.
// Порядок важен: более специфичные модели идут раньше (5070 Ti до 5070).
const GPU_POWER_TABLE = [
	{ re: /rtx\s*5080/i,      w: 360 },
	{ re: /rtx\s*5070\s*ti/i, w: 300 },
	{ re: /rtx\s*5070/i,       w: 250 },
	{ re: /rtx\s*5060\s*ti/i, w: 180 },
	{ re: /rtx\s*5060/i,       w: 145 },
	{ re: /rtx\s*5050/i,       w: 150 },
	{ re: /rtx\s*3060/i,       w: 170 },
	{ re: /rtx\s*3050\s*6g/i, w: 70 },
	{ re: /rtx\s*3050/i,       w: 130 },
	{ re: /rx\s*9070\s*xt/i,  w: 304 },
	{ re: /rx\s*9070/i,        w: 220 },
	{ re: /rx\s*9060\s*xt/i,  w: 160 },
	{ re: /rx\s*9060/i,        w: 160 },
	{ re: /rx\s*7600/i,        w: 165 },
	{ re: /rx\s*580/i,         w: 185 },
	{ re: /rx\s*550/i,         w: 50 },
	{ re: /gt\s*1050\s*ti/i,  w: 75 },
	{ re: /gt\s*1030/i,        w: 30 },
	{ re: /gt\s*730/i,         w: 25 },
	{ re: /gt\s*610/i,         w: 29 },
	{ re: /gt\s*210/i,         w: 31 }
];

// Потребление видеокарты из названия (Вт) или null, если модель неизвестна
function extractGPU_Power(name) {
	for (const { re, w } of GPU_POWER_TABLE) {
		if (re.test(name)) return w;
	}
	return null;
}

// Длина видеокарты (мм) — справочная таблица (в прайсе длина не указана).
// Значения ориентировочные (типовые для популярных моделей), используются
// для предупреждения «видеокарта не помещается в корпус».
const GPU_LENGTH_TABLE = [
	{ re: /rtx\s*5080/i,      mm: 335 },
	{ re: /rtx\s*5070\s*ti/i, mm: 340 },
	{ re: /rtx\s*5070/i,      mm: 305 },
	{ re: /rtx\s*5060\s*ti/i, mm: 280 },
	{ re: /rtx\s*5060/i,      mm: 250 },
	{ re: /rtx\s*5050/i,      mm: 220 },
	{ re: /rtx\s*3060/i,      mm: 280 },
	{ re: /rtx\s*3050\s*6g/i, mm: 200 },
	{ re: /rtx\s*3050/i,      mm: 220 },
	{ re: /rx\s*9070\s*xt/i,  mm: 320 },
	{ re: /rx\s*9070/i,       mm: 300 },
	{ re: /rx\s*9060\s*xt/i,  mm: 280 },
	{ re: /rx\s*9060/i,       mm: 260 },
	{ re: /rx\s*7600/i,       mm: 250 },
	{ re: /rx\s*580/i,        mm: 250 },
	{ re: /rx\s*550/i,        mm: 200 },
	{ re: /gt\s*1050\s*ti/i,  mm: 190 },
	{ re: /gt\s*1030/i,       mm: 170 },
	{ re: /gt\s*730/i,        mm: 170 },
	{ re: /gt\s*610/i,        mm: 170 },
	{ re: /gt\s*210/i,        mm: 160 }
];

// Длина видеокарты (мм) из названия или справочной таблицы; null — неизвестно
function extractGPU_Length(name) {
	// Иногда длина указана в названии
	const explicit = name.match(/длина\s*(\d+)\s*(?:мм|mm)/i);
	if (explicit) return parseInt(explicit[1], 10);
	for (const { re, mm } of GPU_LENGTH_TABLE) {
		if (re.test(name)) return mm;
	}
	return null;
}

// Мощность БП из названия: первое число перед "W" ("БП 1STPLAYER 1000W ...").
// Если явной мощности нет — берём число из модели ("Zalman ZM750-TMX2" -> 750,
// "Lian-Li EG1200G" -> 1200). Число ищется в любом месте слова ("ZM750",
// "EG1200G"), но не как часть большего числа.
function extractPSUPower(name) {
	let m = name.match(/(\d+)\s*W\b/i);
	if (m) return parseInt(m[1], 10);
	m = name.match(/(?:^|[^\d])(\d{3,4})(?!\d)/);
	return m ? parseInt(m[1], 10) : null;
}

// Признак системы жидкостного охлаждения (СЖО)
function isAIO(name) {
	return /водяного охлаждения|сжо|\baio\b|водян/i.test(name);
}

// Высота кулера (мм) из названия: "высота 157 мм", "высота 23mm".
// Для СЖО высота не критична (помпа ~60 мм) — возвращаем null.
function extractCoolerHeight(name) {
	if (isAIO(name)) return null;
	let m = name.match(/высота\s*(\d+)\s*(?:мм|mm)/i);
	if (!m) m = name.match(/height\s*(\d+)\s*mm/i);
	return m ? parseInt(m[1], 10) : null;
}

// Размер радиатора СЖО (мм): "Levante II 240 BLACK", "Liquid Freezer III Pro 420",
// "SL360 XE", "360mm". Ищем типичные размеры радиаторов (240/280/360/420,
// реже 120/140) — иначе ловим "FAN 120mm" из списка вентиляторов.
function extractAioRadiator(name) {
	if (!isAIO(name)) return null;
	// Размер радиатора в названии модели: "DX240", "FX360", "SL240", "Levante II 240 BLACK".
	// Перед числом может стоять буква модели (без границы слова), поэтому запрещаем
	// только соседние цифры (чтобы не словить "LGA1200" или "DDR5-6000").
	let m = name.match(/(?:^|[^0-9])(420|360|280|240)(?!\d)/);
	if (m) return parseInt(m[1], 10);
	m = name.match(/(?:^|[^0-9])(140|120)(?!\d)/);
	if (m) return parseInt(m[1], 10);
	return null;
}

// Встроенный БП в корпусе (Вт): "Корпус ... Vicsone S615 200W ... / БП 200W 80+ Bronze".
// null — корпус без встроенного БП. "Без БП" в названии — явно без БП.
function extractCaseBuiltInPsu(name) {
	if (/без\s*бп/i.test(name)) return null;
	let m = name.match(/бп\s*(\d{3,4})\s*w/i);
	if (m) return parseInt(m[1], 10);
	// Модель со встроенным БП: "Vicsone S615 200W", "M3X 500W"
	m = name.match(/\b[a-zа-яё0-9\-]+\s*(\d{3,4})\s*w\b/i);
	if (m) return parseInt(m[1], 10);
	return null;
}

// Максимальная длина видеокарты в корпусе (мм): "VGA MAX 400mm", "GPU Max 225mm"
function extractCaseGpuMaxLen(name) {
	let m = name.match(/vga\s*max\s*(\d+)\s*mm/i);
	if (!m) m = name.match(/gpu\s*max\s*(\d+)\s*mm/i);
	if (!m) m = name.match(/gpu\s*max\s*(\d+)/i);
	return m ? parseInt(m[1], 10) : null;
}

// Максимальная высота кулера в корпусе (мм): "CPU MAX 168mm", "CPU Cooler Max 70mm"
function extractCaseCpuMaxHeight(name) {
	let m = name.match(/cpu\s*cooler\s*max\s*(\d+)\s*mm/i);
	if (!m) m = name.match(/cpu\s*max\s*(\d+)\s*mm/i);
	if (!m) m = name.match(/cpu\s*max\s*(\d+)/i);
	return m ? parseInt(m[1], 10) : null;
}

// Максимальный размер радиатора СЖО в корпусе (мм): "радиатор 240мм", "поддержка 360мм"
function extractCaseRadiatorMax(name) {
	let m = name.match(/радиатор\w*\s*(?:до\s*)?(\d{3})\s*(?:мм|mm)/i);
	if (!m) m = name.match(/поддержк\w*\s*радиатор\w*\s*(\d{3})\s*(?:мм|mm)/i);
	return m ? parseInt(m[1], 10) : null;
}

// Определение категории компонента по названию.
// Универсальные правила для поставщика 1 (XLS, стиль "Процессор Socket-")
// и поставщика 2 (XLSX, стиль "Процессор <AM5> ...", "MB ...", "Накопитель SSD ...").
function classifyCategory(name) {
	const n = name.trim().toLowerCase();

	// Процессоры: "Процессор Socket-" / "Процессор BOX Socket-" / "Процессор <AM5>"
	if (/^процессор/.test(n)) return "cpu";

	// Видеокарты: "Видеокарта ..." (в начале имени)
	if (/^видеокарта/.test(n)) return "gpu";

	// Материнские платы: "MB ", "Мат. платы", "Материнская плата"
	if (/^mb(\s|$)/.test(n) || /^мат\.?\s*плат/.test(n) || /^материнская\s+плат/.test(n)) return "motherboard";

	// ОЗУ: имя начинается с DDR4/DDR5 или "Оперативная память"
	// (исключаем SO-DIMM и серверную память; UDIMM/CUDIMM — десктопные, оставляем)
	if (/^ddr[\s-]?[45]/.test(n) || /^оперативная\s+память/.test(n)) {
		if (/so-?dimm|ecc|сервер|registered|rdimm|lrdimm|для сервера/i.test(n)) return null;
		return "ram";
	}

	// SSD: "SSD M.2/2.5" или "Накопитель SSD ..." (исключаем серверные).
	// Серверные Micron 7450/7550 ловим по "Micron 7450", а не по голому
	// числу — иначе отсеются десктопные Samsung 990 Pro со скоростью "7450 MBps".
	if (/^ssd\b/.test(n) || /^накопитель\s+ssd/.test(n)) {
		if (/enterprise|solidigm|\bpm\d{3}|\bsas\b|u\.2|sff|сервер|промышленн|p5520|p5530|\bmicron\s*7[45]5[05]\b/i.test(n)) return null;
		return "ssd";
	}

	// HDD: "HDD 3.5/2.5", "Накопитель HDD ...", "Жесткий диск"
	// (исключаем серверные SAS/Ultrastar/Exos/Gold/Enterprise)
	if (/^hdd\s*[23]\s*\.?\s*5/.test(n) || /^накопитель\s+hdd/.test(n) || /^ж(?:е|ё)сткий\s+диск/.test(n)) {
		if (/sas|сервер|ultrastar|exos|\bgold\b|enterprise/i.test(n)) return null;
		return "hdd";
	}

	// Блоки питания: "БП ...", "Блок питания ..." (исключаем для коммутаторов/серверов)
	if (/^бп(\s|$)/.test(n) || /^блок\s+питания/.test(n)) {
		if (/для коммутаторов|для роутер|для сервера|промышленн/i.test(n)) return null;
		return "psu";
	}

	// Кулеры: "Кулер ...", "Вент. ...", "Система/Комплект водяного охлаждения ..."
	// (исключаем крепления, разветвители, серверные кулеры и вентиляторы корпуса;
	// ARGB и 1U-4U НЕ исключаем — у поставщика 1 есть десктопные ARGB/2U-4U кулеры CPU)
	if (/^кулер/.test(n) || /^вент\.\s/.test(n) || /^система водяного охлаждения/.test(n) || /^комплект водяного охлаждения/.test(n)) {
		// Корпусные вентиляторы поставщика 2 (в его прайсе "Кулер ..." —
		// это вентиляторы для корпуса: Aerocool Orbit/Mirage/Astro/Saturn/Eclipse,
		// Thermalright TL-S, ExeGate EX/EP, 5bites FB, DeepCool FL, ARCTIC S8xxx);
		// серверные кулеры Ablecom/Procase тоже исключаем
		if (/креплени|разветвител|supermicro|snk-|gooxi|\bdell\b|сервер|для корпуса|af-\d{3}|aerocool\s+(orbit|mirage|astro|saturn|eclipse)|thermalright\s+tl-s|exegate\s+(ex|ep)\d{5}|5bites\s+fb|deepcool\s+fl\d|arctic\s+s\d{4}|ablecom|procase/i.test(n)) return null;
		return "cooler";
	}

	// Корпуса: "Корпус ..." (исключаем Raspberry Pi и серверные корпуса)
	if (/^корпус/.test(n)) {
		if (/raspberry|сервер|для корпусов|аксессуар|радиатор|supermicro|cse-\d|chenbro|jbod|\bbvk\b|rack|для сервера/i.test(n)) return null;
		return "case";
	}

	return null;
}

// ===== Общий сбор каталога из строк таблицы =====
// Используется для XLS и XLSX: rows — массив строк,
// каждая строка — массив значений ячеек (строки).
// opts: { headerIdx, nameCol, priceCol } — для XLSX колонки задаются явно;
// для XLS достаточно headerIdx (колонка "код" ищется в заголовках).
function rowsToCatalog(cellsRows, opts) {
	opts = opts || {};
	const headerIdx = opts.headerIdx != null ? opts.headerIdx : 0;
	// Ищем колонку "код" в заголовках (запасной вариант — 1-я колонка)
	const headers = cellsRows[headerIdx].map(h => String(h).trim().toLowerCase());
	let codeIdx = opts.nameCol;
	if (codeIdx == null) {
		codeIdx = headers.findIndex(h => h === "код" || h.includes("код"));
		if (codeIdx === -1) codeIdx = 0;
	}
	const priceCol = opts.priceCol != null ? opts.priceCol : null;
	// Колонка характеристик/описания (колонка C у поставщика 2) — для извлечения
	// сокета, поколения памяти и TDP, т.к. в названии их может не быть
	const descCol = opts.descCol != null ? opts.descCol : -1;
	// Колонка «Резерв» (колонка I у поставщика 2) — позиции со значением «В резерве»
	const reserveCol = opts.reserveCol != null ? opts.reserveCol : -1;
	// Строки в резерве XLS-прайса поставщика 1 (выделены синим цветом текста)
	const reserveRows = opts.reserveRows || null;

	const result = { cpu: [], gpu: [], motherboard: [], ram: [], ssd: [], hdd: [], psu: [], cooler: [], case: [] };

	// Текущий раздел/подраздел прайса (для прайсов с иерархией категорий,
	// напр. поставщик 2: категория «Кулера» -> подкатегория «Для корпуса (case) /»).
	// Маркер раздела — строка с единственной заполненной ячейкой в колонке A
	// (текст, без цены и без имени товара).
	let currentSection = "";
	let sawSection = false; // прайс с разделами (структура поставщика 2)

	for (let i = headerIdx + 1; i < cellsRows.length; i++) {
		const cells = cellsRows[i];
		if (!cells) continue;

		// Маркер раздела/подраздела: только колонка A заполнена текстом
		const filledCells = cells
			.map((c, ci) => ({ ci, v: String(c ?? "").trim() }))
			.filter(x => x.v !== "");
		if (filledCells.length === 1 && filledCells[0].ci === 0) {
			currentSection = filledCells[0].v;
			sawSection = true;
			continue;
		}
		if (cells.length < 2) continue;

		// Цена: для XLSX — фиксированная колонка, иначе — поиск по строке
		const price = priceCol != null
			? (parseFloat(String(cells[priceCol]).replace(",", ".")) || 0)
			: extractPrice(cells);
		if (price <= 0) continue;

		// Товары из разделов, не относящихся к сборке десктопа:
		// «Для корпуса (case) /» — корпусные вентиляторы
		if (/для корпуса|\(case\)/i.test(currentSection)) continue;

		const name = extractName(cells, codeIdx);
		if (!name) continue;

		const desc = descCol >= 0 ? String(cells[descCol] || "").trim() : "";
		// Товар в резерве: строка с синим текстом в XLS-прайсе поставщика 1
		// или значение «В резерве» в колонке «Резерв» поставщика 2
		const reserved = (reserveRows && reserveRows.has(i))
			|| (reserveCol >= 0 && /резерв/i.test(String(cells[reserveCol] || "")));

		const category = classifyCategory(name);
		if (!category) continue;

		// Пропускаем товары только в составе ПЭВМ/сервера/моноблока
		if (/только в составе пэвм|только в составе сервера|только вместе с моноблоком|только в комплекте с моноблоком/i.test(name)) continue;

		if (category === "cpu") {
			// Серверные процессоры (секции «Серверные процессоры», «Серверное оборудование»,
			// «Процессоры для серверов» или Xeon/EPYC/Opteron в названии прайса с разделами)
			if (/сервер/i.test(currentSection)) continue;
			if (sawSection && /xeon|epyc|opteron|серверн/i.test(name + " " + desc)) continue;
			const socket = extractSocket(name, desc);
			result.cpu.push({ name, price, reserved, socket, memoryType: memoryTypeFromSocket(socket), tdp: extractCPU_TDP(name + " " + desc), row: cells, rowIndex: i });
		} else if (category === "gpu") {
			result.gpu.push({ name, price, reserved, power: extractGPU_Power(name), length: extractGPU_Length(name), row: cells, rowIndex: i });
		} else if (category === "motherboard") {
			// Серверные платы (секции прайса) — не для сборки десктопа
			if (/сервер/i.test(currentSection)) continue;
			const socket = extractSocket(name, desc);
			// Поколение памяти платы — по названию и описанию (DDR4/DDR5 в тексте,
			// напр. "память 2xDDR4", "память 4xDDR5/DDR5 CUDIMM" в характеристиках;
			// поддерживаем и форму с дефисом "DDR-5"), иначе по сокету
			const memoryType = /ddr[\s-]?5/i.test(name + " " + desc)
				? "DDR5"
				: (/ddr[\s-]?4/i.test(name + " " + desc) ? "DDR4" : memoryTypeFromSocket(socket));
			result.motherboard.push({ name, price, reserved, socket, memoryType, row: cells, rowIndex: i });
		} else if (category === "ram") {
			// Поколение памяти — по названию (DDR5 / DDR-5 / DDR5-6400; стиль поставщика 2)
			result.ram.push({ name, price, reserved, memoryType: /ddr[\s-]?5\b/i.test(name) ? "DDR5" : "DDR4", row: cells, rowIndex: i });
		} else if (category === "ssd") {
			result.ssd.push({ name, price, reserved, isM2: /m\s*\.?\s*2\b/i.test(name), row: cells, rowIndex: i });
		} else if (category === "hdd") {
			result.hdd.push({ name, price, reserved, row: cells, rowIndex: i });
		} else if (category === "psu") {
			result.psu.push({ name, price, reserved, power: extractPSUPower(name), row: cells, rowIndex: i });
		} else if (category === "cooler") {
			result.cooler.push({ name, price, reserved, tdp: extractCoolerTDP(name), height: extractCoolerHeight(name), radiator: extractAioRadiator(name), row: cells, rowIndex: i });
		} else if (category === "case") {
			// Серверные корпуса (секция «Серверные корпуса» и далее) — не для сборки десктопа
			if (/сервер/i.test(currentSection)) continue;
			result.case.push({ name, price, reserved, builtInPsuPower: extractCaseBuiltInPsu(name), gpuMaxLen: extractCaseGpuMaxLen(name), cpuMaxHeight: extractCaseCpuMaxHeight(name), radiatorMax: extractCaseRadiatorMax(name), row: cells, rowIndex: i });
		}
	}
	return result;
}

// ============================================================
// Парсинг XLS (бинарный BIFF8, контейнер OLE2/CFB)
// ============================================================
// Реализовано без внешних библиотек: разбор контейнера CFB,
// потока Workbook и записей BIFF8 (SST, LABELSST, NUMBER, RK,
// MULRK, LABEL, FORMULA/STRING). Ячейки приводятся к тому же
// виду, что и строки таблицы, и обрабатываются общим rowsToCatalog.

// Стандартная палитра BIFF8 (если в книге нет записи PALETTE)
const BIFF8_PALETTE = [
	[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255],
	[0, 0, 0], [255, 255, 255], [255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 0], [255, 0, 255], [0, 255, 255],
	[128, 0, 0], [0, 128, 0], [0, 0, 128], [128, 128, 0], [128, 0, 128], [0, 128, 128], [192, 192, 192], [128, 128, 128]
];

function parseXLS(arrayBuffer) {
	try {
		const u8 = new Uint8Array(arrayBuffer);
		// Сигнатура OLE2/CFB: D0 CF 11 E0 A1 B1 1A E1
		if (u8.length < 8 ||
			u8[0] !== 0xD0 || u8[1] !== 0xCF || u8[2] !== 0x11 || u8[3] !== 0xE0 ||
			u8[4] !== 0xA1 || u8[5] !== 0xB1 || u8[6] !== 0x1A || u8[7] !== 0xE1) {
			return null; // не бинарный XLS
		}

		const wb = readWorkbookStream(u8);
		if (!wb) return null;

		// Записи BIFF8 (тип, позиция данных, данные)
		const records = [];
		const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
		for (let pos = 0; pos + 4 <= wb.length;) {
			const type = dv.getUint16(pos, true);
			const len = dv.getUint16(pos + 2, true);
			if (pos + 4 + len > wb.length) break;
			records.push({ type, data: wb.subarray(pos + 4, pos + 4 + len) });
			pos += 4 + len;
		}

		// Кодовая страница книги (для сжатых 8-битных строк)
		let codepage = 1251;
		for (const r of records) {
			if (r.type === 0x0042) { // CODEPAGE
				codepage = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength).getUint16(0, true);
				break;
			}
		}

		// Таблица общих строк
		const sst = parseSST(records, codepage);
		if (!sst) return null;

		// Позиция первого листа (BOUNDSHEET)
		let sheetPos = -1;
		for (const r of records) {
			if (r.type === 0x0085) {
				sheetPos = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength).getUint32(0, true);
				break;
			}
		}
		if (sheetPos < 0) return null;

		// Форматы ячеек — чтобы находить строки в резерве (у поставщика 1
		// такие строки выделены СИНИМ цветом текста).
		// XF (0x00E0): ifnt(2) ifmt(2) ... icvFore(2) icvBack(2) sGrBit(1) attrib(1)
		const xfs = [];
		for (const r of records) {
			if (r.type === 0x00E0) {
				const d = r.data;
				const g = new DataView(d.buffer, d.byteOffset, d.byteLength);
				xfs.push({ ifnt: g.getUint16(0, true), icvBack: g.getUint16(12, true), pattern: d[14] & 0x3F });
			}
		}
		// FONT (0x0031): цвет шрифта icv — байты 4-5 (по спецификации MS-XLS)
		const fontIcv = [];
		for (const r of records) if (r.type === 0x0031) {
			const g = new DataView(r.data.buffer, r.data.byteOffset, r.data.byteLength);
			fontIcv.push(g.getUint16(4, true));
		}
		// Палитра (0x0092): nColors(2) + квады RGB(4 байта: R,G,B,зарезервировано)
		const palette = BIFF8_PALETTE.slice();
		const palRec = records.find(r => r.type === 0x0092);
		if (palRec) {
			const g = new DataView(palRec.data.buffer, palRec.data.byteOffset, palRec.data.byteLength);
			const n = Math.min(g.getUint16(0, true), (palRec.data.length - 2) >> 2);
			for (let i = 0; i < n; i++) palette[i] = [palRec.data[2 + i * 4], palRec.data[3 + i * 4], palRec.data[4 + i * 4]];
		}
		// «Резерв» — синий цвет текста (синий канал доминирует).
		// Красный (icv=2) — обычный цвет прайса, его не считаем резервом.
		const isReserveColor = icv => {
			if (icv == null || icv < 0 || icv >= palette.length) return false;
			const c = palette[icv];
			if (!c) return false;
			return c[2] >= 128 && c[2] > c[0] && c[2] > c[1];
		};
		const xfIsReserve = ixfe => {
			const xf = xfs[ixfe];
			if (!xf) return false;
			if (xf.pattern !== 0 && isReserveColor(xf.icvBack)) return true; // синяя заливка ячейки
			const f = fontIcv[xf.ifnt];
			if (f != null && f !== 0x7FFF && isReserveColor(f)) return true; // синий шрифт (0x7FFF = авто)
			return false;
		};

		// Ячейки первого листа: row -> Map(col -> значение) + номера строк в резерве
		const sheet = parseSheetCells(wb, sheetPos, sst.strings, xfIsReserve);
		if (!sheet || !sheet.grid || sheet.grid.size === 0) return null;
		const grid = sheet.grid;
		const reserveRows = sheet.reserveRows;

		// Приводим к виду строк CSV (массив строковых значений ячеек)
		const rows = [...grid.keys()].sort((a, b) => a - b);
		const cellsRows = rows.map(row => {
			const m = grid.get(row);
			const maxCol = Math.max(0, ...m.keys());
			const arr = [];
			for (let c = 0; c <= maxCol; c++) arr.push(m.has(c) ? cellToString(m.get(c)) : "");
			return arr;
		});

		// Строка заголовков — та, где есть колонка "код"
		let headerIdx = 0;
		for (let i = 0; i < Math.min(5, cellsRows.length); i++) {
			if (cellsRows[i].some(c => String(c).trim().toLowerCase() === "код")) { headerIdx = i; break; }
		}

		// Для выгрузки заказа поставщику сохраняем строки шапки как в исходном прайсе
		const parsed = rowsToCatalog(cellsRows, { headerIdx, reserveRows });
		if (parsed) parsed.headerRows = cellsRows.slice(0, headerIdx + 1);
		return parsed;
	} catch (e) {
		return null;
	}
}

// Чтение потока Workbook из контейнера CFB
function readWorkbookStream(u8) {
	const u16 = o => u8[o] | (u8[o + 1] << 8);
	const u32 = o => (u8[o] | (u8[o + 1] << 8) | (u8[o + 2] << 16) | (u8[o + 3] << 24)) >>> 0;

	const sectorSize = 1 << u16(0x1E);
	const miniSectorSize = 1 << u16(0x20);
	const miniStreamCutoff = u32(0x38);
	const firstMiniFATSector = u32(0x3C);
	const numMiniFATSectors = u32(0x40);
	const firstDIFATSector = u32(0x44);
	const numDIFATSectors = u32(0x48);
	const firstDirSector = u32(0x30);

	// Список секторов FAT (через DIFAT в заголовке и доп. секторах)
	const fat = [];
	const difat = [];
	for (let i = 0; i < 109; i++) {
		const v = u32(0x4C + i * 4);
		if (v !== 0xFFFFFFFF) difat.push(v);
	}
	let difatSector = firstDIFATSector;
	for (let d = 0; d < numDIFATSectors && difatSector !== 0xFFFFFFFE; d++) {
		const off = (difatSector + 1) * sectorSize;
		for (let i = 0; i < sectorSize / 4; i++) {
			const v = u32(off + i * 4);
			if (v !== 0xFFFFFFFF) difat.push(v);
		}
		difatSector = u32(off + sectorSize - 4);
	}
	for (const s of difat) {
		const off = (s + 1) * sectorSize;
		for (let i = 0; i < sectorSize / 4; i++) fat.push(u32(off + i * 4));
	}

	// Чтение цепочки секторов
	function readChain(start, sizeLimit) {
		const out = [];
		let s = start;
		let remaining = sizeLimit == null ? Infinity : sizeLimit;
		let guard = 0;
		while (s !== 0xFFFFFFFE && s !== 0xFFFFFFFF && s != null && remaining > 0 && guard++ < 200000) {
			const off = (s + 1) * sectorSize;
			const take = Math.min(sectorSize, remaining);
			for (let i = 0; i < take; i++) out.push(u8[off + i]);
			remaining -= take;
			s = fat[s];
		}
		return new Uint8Array(out);
	}

	// Каталог потоков
	const dirData = readChain(firstDirSector, null);
	const u32At = (d, o) => (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16) | (d[o + 3] << 24)) >>> 0;
	const entries = [];
	for (let i = 0; i + 128 <= dirData.length; i += 128) {
		const nameLen = dirData[i + 64] | (dirData[i + 65] << 8);
		let name = "";
		if (nameLen > 2) {
			const chars = [];
			for (let c = 0; c < nameLen - 2; c += 2) chars.push(dirData[i + c] | (dirData[i + c + 1] << 8));
			name = String.fromCharCode(...chars);
		}
		entries.push({
			name,
			type: dirData[i + 66],
			start: u32At(dirData, i + 116),
			size: u32At(dirData, i + 120)
		});
	}

	// Mini FAT (для потоков меньше miniStreamCutoff)
	let miniFAT = null;
	if (numMiniFATSectors > 0) miniFAT = readChain(firstMiniFATSector, numMiniFATSectors * sectorSize);

	function readMiniChain(start, sizeLimit) {
		const root = entries.find(e => e.type === 5);
		if (!root) return new Uint8Array(0);
		const miniStream = readChain(root.start, root.size);
		const out = [];
		let s = start;
		let remaining = sizeLimit;
		while (s !== 0xFFFFFFFE && s !== 0xFFFFFFFF && remaining > 0) {
			const off = s * miniSectorSize;
			const take = Math.min(miniSectorSize, remaining);
			for (let i = 0; i < take; i++) out.push(miniStream[off + i]);
			remaining -= take;
			const idx = s * 4;
			s = (miniFAT[idx] | (miniFAT[idx + 1] << 8) | (miniFAT[idx + 2] << 16) | (miniFAT[idx + 3] << 24)) >>> 0;
		}
		return new Uint8Array(out);
	}

	const wbEntry = entries.find(e => e.name === "Workbook") || entries.find(e => e.name === "Book");
	if (!wbEntry) return null;
	return wbEntry.size < miniStreamCutoff
		? readMiniChain(wbEntry.start, wbEntry.size)
		: readChain(wbEntry.start, wbEntry.size);
}

// Парсинг таблицы общих строк SST (с учётом CONTINUE-записей).
// Если строка переносится через границу записей, в начале продолжения
// повторяется байт флагов (grbit) — по алгоритму xlrd.
function parseSST(records, codepage) {
	const sstIdx = records.findIndex(r => r.type === 0x00FC);
	if (sstIdx === -1) return null;

	const chunks = [records[sstIdx].data];
	let i = sstIdx + 1;
	while (i < records.length && records[i].type === 0x003C) {
		chunks.push(records[i].data);
		i++;
	}

	let datainx = 0;
	let data = chunks[0];
	let pos = 8; // пропускаем cstTotal (4) и cstUnique (4)
	const cstUnique = (data[4] | (data[5] << 8) | (data[6] << 16) | (data[7] << 24)) >>> 0;
	const strings = [];
	const cpDecoder = new TextDecoder(codepage === 1200 ? "utf-16le" : "windows-1251");

	function adv() {
		datainx++;
		if (datainx >= chunks.length) throw new Error("SST overrun");
		data = chunks[datainx];
		pos = 0;
	}

	for (let si = 0; si < cstUnique; si++) {
		if (pos >= data.length) adv();
		const nchars = data[pos] | (data[pos + 1] << 8);
		pos += 2;
		let options = data[pos];
		pos += 1;

		// bit 0 — 16-битные символы, bit 2 — фонетика, bit 3 — rich-форматирование
		let rtcount = 0, phosz = 0;
		if (options & 0x08) { rtcount = data[pos] | (data[pos + 1] << 8); pos += 2; }
		if (options & 0x04) { phosz = (data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)) >>> 0; pos += 4; }

		let acc = "";
		let charsgot = 0, charsavail = 0;
		while (true) {
			const charsneed = nchars - charsgot;
			if (options & 1) {
				charsavail = Math.min((data.length - pos) >> 1, charsneed);
				for (let c = 0; c < charsavail; c++) {
					acc += String.fromCharCode(data[pos + c * 2] | (data[pos + c * 2 + 1] << 8));
				}
				pos += 2 * charsavail;
			} else {
				charsavail = Math.min(data.length - pos, charsneed);
				acc += cpDecoder.decode(data.subarray(pos, pos + charsavail));
				pos += charsavail;
			}
			charsgot += charsavail;
			if (charsgot === nchars) break;
			// Строка продолжается в следующей записи: новый байт флагов в начале
			adv();
			options = data[0];
			pos = 1;
		}

		if (rtcount) {
			for (let r = 0; r < rtcount; r++) {
				if (pos === data.length) adv();
				pos += 4;
			}
		}
		pos += phosz;
		if (pos >= data.length) {
			pos -= data.length;
			datainx += 1;
			if (datainx < chunks.length) data = chunks[datainx];
		}
		strings.push(acc);
	}
	return { strings, cstUnique };
}

// Ячейки первого листа: row -> Map(col -> значение строки/числа) + строки в резерве.
// xfIsReserve(ixfe) — функция проверки формата ячейки на «резервный» цвет (шрифт/заливка).
function parseSheetCells(wb, sheetPos, strings, xfIsReserve) {
	const grid = new Map();
	const reserveRows = new Set();
	const dv = new DataView(wb.buffer, wb.byteOffset, wb.byteLength);
	let pos = sheetPos;
	let guard = 0;
	let formulaPending = null;

	while (pos + 4 <= wb.length && guard++ < 200000) {
		const type = dv.getUint16(pos, true);
		const len = dv.getUint16(pos + 2, true);
		const rs = pos + 4;
		pos += 4 + len;

		if (type === 0x000A) break; // EOF — конец листа

		if (type === 0x0208) { // ROW (формат всей строки): rw(2) ... grbit(2) ixfe(2)
			if (len >= 16) markReserve(dv.getUint16(rs, true), dv.getUint16(rs + 14, true));
		} else if (type === 0x0203) { // NUMBER
			set(dv.getUint16(rs, true), dv.getUint16(rs + 2, true), dv.getFloat64(rs + 6, true), dv.getUint16(rs + 4, true));
		} else if (type === 0x027E) { // RK (сжатое число)
			set(dv.getUint16(rs, true), dv.getUint16(rs + 2, true), decodeRK(dv.getUint32(rs + 6, true)), dv.getUint16(rs + 4, true));
		} else if (type === 0x00BD) { // MULRK (несколько сжатых чисел)
			const row = dv.getUint16(rs, true);
			const firstCol = dv.getUint16(rs + 2, true);
			const lastCol = dv.getUint16(rs + len - 2, true);
			const nCols = lastCol - firstCol + 1;
			for (let c = 0; c < nCols; c++) {
				set(row, firstCol + c, decodeRK(dv.getUint32(rs + 6 + c * 6, true)), dv.getUint16(rs + 4 + c * 6, true));
			}
		} else if (type === 0x00FD) { // LABELSST (строка из SST)
			set(dv.getUint16(rs, true), dv.getUint16(rs + 2, true), strings[dv.getUint32(rs + 6, true)], dv.getUint16(rs + 4, true));
		} else if (type === 0x0204) { // LABEL (строка в ячейке)
			set(dv.getUint16(rs, true), dv.getUint16(rs + 2, true), decodeBIFFString(wb, dv, rs + 6), dv.getUint16(rs + 4, true));
		} else if (type === 0x0006) { // FORMULA
			const row = dv.getUint16(rs, true), col = dv.getUint16(rs + 2, true);
			// 8 байт результата: если последние два = FF FF — строковый (в STRING)
			if (wb[rs + 12] === 0xFF && wb[rs + 13] === 0xFF) {
				formulaPending = { row, col };
			} else {
				set(row, col, dv.getFloat64(rs + 6, true), dv.getUint16(rs + 4, true));
			}
		} else if (type === 0x0207 && formulaPending) { // STRING (результат формулы)
			set(formulaPending.row, formulaPending.col, decodeBIFFString(wb, dv, rs));
			formulaPending = null;
		}
	}
	return { grid, reserveRows };

	function markReserve(row, ixfe) {
		if (xfIsReserve && xfIsReserve(ixfe)) reserveRows.add(row);
	}

	function set(row, col, v, ixfe) {
		if (v === undefined || v === null) return;
		if (!grid.has(row)) grid.set(row, new Map());
		grid.get(row).set(col, v);
		markReserve(row, ixfe);
	}
}

// Значение ячейки XLS в строку (числа — с округлением до 2 знаков)
function cellToString(v) {
	if (typeof v === "string") return v;
	if (typeof v === "number") {
		if (!isFinite(v)) return "";
		return String(Math.round(v * 100) / 100);
	}
	return "";
}

// Декодирование короткой BIFF8-строки (cch(2) + grbit(1) + символы)
function decodeBIFFString(u8, dv, start) {
	const cch = dv.getUint16(start, true);
	const grbit = u8[start + 2];
	if (grbit & 1) {
		let s = "";
		for (let i = 0; i < cch; i++) {
			s += String.fromCharCode(u8[start + 3 + i * 2] | (u8[start + 4 + i * 2] << 8));
		}
		return s;
	}
	return new TextDecoder("windows-1251").decode(u8.subarray(start + 3, start + 3 + cch));
}

// Число RK (сжатый формат числа в BIFF8)
function decodeRK(rk) {
	const b = rk >>> 0;
	const fx = b & 3;
	if (fx === 0 || fx === 1) {
		let v = ((b >>> 2) << 2) >> 2; // знаковое 30-битное целое
		if (fx === 1) v /= 100;
		return v;
	}
	const v30 = b >>> 2;
	const sign = (v30 & 0x20000000) ? -1 : 1;
	const exp = (v30 >>> 21) & 0xFF;
	const mant = v30 & 0x1FFFFF;
	let val;
	if (exp === 0) val = sign * mant * Math.pow(2, -126 - 21);
	else if (exp === 0xFF) val = NaN;
	else val = sign * (1 + mant / 0x200000) * Math.pow(2, exp - 127);
	if (fx === 3) val /= 100;
	return val;
}

// ============================================================
// Парсинг XLSX (ZIP-архив + XML, формат OpenXML)
// ============================================================
// XLSX — это ZIP-архив. Читаем центральный каталог (EOCD),
// распаковываем только нужные файлы (workbook.xml, rels,
// sharedStrings.xml и первый worksheet) через DecompressionStream,
// затем разбираем XML через DOMParser.

// Чтение записей ZIP-архива из байтов
function readZipEntries(u8) {
	const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);

	// Ищем EOCD (PK\x05\x06) с конца файла
	let eocd = -1;
	const min = Math.max(0, u8.length - 65557);
	for (let i = u8.length - 22; i >= min; i--) {
		if (u8[i] === 0x50 && u8[i + 1] === 0x4B && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) { eocd = i; break; }
	}
	if (eocd < 0) return null;

	const count = dv.getUint16(eocd + 10, true);
	const cdSize = dv.getUint32(eocd + 12, true);
	const cdOffset = dv.getUint32(eocd + 16, true);
	if (count === 0 || cdOffset + cdSize > u8.length) return null;

	const entries = [];
	let p = cdOffset;
	for (let n = 0; n < count && p + 46 <= u8.length; n++) {
		// Запись центрального каталога: PK\x01\x02
		if (u8[p] !== 0x50 || u8[p + 1] !== 0x4B || u8[p + 2] !== 0x01 || u8[p + 3] !== 0x02) break;
		const method = dv.getUint16(p + 10, true);
		const compSize = dv.getUint32(p + 20, true);
		const nameLen = dv.getUint16(p + 28, true);
		const extraLen = dv.getUint16(p + 30, true);
		const commentLen = dv.getUint16(p + 32, true);
		const localOffset = dv.getUint32(p + 42, true);
		const name = new TextDecoder("utf-8").decode(u8.subarray(p + 46, p + 46 + nameLen));
		entries.push({ name, method, compSize, localOffset });
		p += 46 + nameLen + extraLen + commentLen;
	}
	if (entries.length === 0) return null;

	// Считываем сжатые данные из локальных заголовков
	for (const e of entries) {
		const p0 = e.localOffset;
		if (p0 + 30 > u8.length) continue;
		const nameLen = dv.getUint16(p0 + 26, true);
		const extraLen = dv.getUint16(p0 + 28, true);
		const dataStart = p0 + 30 + nameLen + extraLen;
		if (dataStart + e.compSize > u8.length) continue;
		e.data = u8.slice(dataStart, dataStart + e.compSize);
	}
	return entries;
}

// Распаковка deflate (метод 8) через нативный DecompressionStream
async function inflateRaw(data) {
	if (typeof DecompressionStream === "undefined") return null;
	const ds = new DecompressionStream("deflate-raw");
	const stream = new Blob([data]).stream().pipeThrough(ds);
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

// Разбор XML-текста (для workbook/rels/sheet/sharedStrings)
function parseXml(text) {
	try {
		return new DOMParser().parseFromString(text, "application/xml");
	} catch (e) {
		return null;
	}
}

// Индекс колонки из ссылки ячейки ("A5" -> 0, "F5" -> 5)
function colIndexOf(ref) {
	const m = String(ref).match(/^([A-Z]+)/i);
	if (!m) return 0;
	let idx = 0;
	for (const ch of m[1].toUpperCase()) idx = idx * 26 + (ch.charCodeAt(0) - 64);
	return idx - 1;
}

// Значение ячейки XLSX по типу (t): s — общая строка, inlineStr,
// str — результат формулы, b — булево, иначе число
function xlsxCellValue(c, shared) {
	const t = c.getAttribute("t");
	const vEl = c.getElementsByTagName("v")[0];
	if (t === "s") {
		const idx = vEl ? parseInt(vEl.textContent, 10) : -1;
		return shared && idx >= 0 && idx < shared.length ? shared[idx] : "";
	}
	if (t === "inlineStr") {
		let s = "";
		const ts = c.getElementsByTagName("t");
		for (const el of ts) s += el.textContent || "";
		return s;
	}
	if (t === "str") return vEl ? vEl.textContent : "";
	if (t === "b") return vEl && vEl.textContent === "1" ? "TRUE" : "FALSE";
	if (t === "e") return "";
	return vEl ? vEl.textContent : "";
}

// Основная функция парсинга XLSX (async — из-за распаковки)
async function parseXLSX(arrayBuffer) {
	try {
		const entries = readZipEntries(new Uint8Array(arrayBuffer));
		if (!entries) return null;

		const byName = new Map();
		for (const e of entries) {
			const key = e.name.replace(/^\/+/, "");
			if (!byName.has(key)) byName.set(key, e);
		}

		const readEntry = async name => {
			const e = byName.get(name);
			if (!e || !e.data) return null;
			let data = e.data;
			if (e.method === 8) {
				data = await inflateRaw(data);
				if (!data) return null;
			}
			return new TextDecoder("utf-8").decode(data);
		};

		// Путь к workbook.xml через корневые rels (_rels/.rels).
		// Тип книги оканчивается на "/officeDocument" — важно, чтобы не
		// захватить custom-properties (тоже содержит "officeDocument")
		let wbPath = "xl/workbook.xml";
		const rootRels = await readEntry("_rels/.rels");
		if (rootRels) {
			const doc = parseXml(rootRels);
			if (doc) {
				for (const rel of doc.getElementsByTagName("Relationship")) {
					if (/officeDocument$/i.test(rel.getAttribute("Type") || "")) {
						const t = (rel.getAttribute("Target") || "").replace(/^\/+/, "");
						if (t) wbPath = t;
						break;
					}
				}
			}
		}

		const wbXml = await readEntry(wbPath);
		const wbDoc = parseXml(wbXml);
		if (!wbDoc) return null;

		// Rels книги: rId -> { type, target } (относительно папки книги)
		const wbBase = wbPath.includes("/") ? wbPath.slice(0, wbPath.lastIndexOf("/") + 1) : "";
		const wbRelsXml = await readEntry(wbBase + "_rels/" + wbPath.split("/").pop() + ".rels");
		const rels = new Map();
		if (wbRelsXml) {
			const doc = parseXml(wbRelsXml);
			if (doc) {
				for (const rel of doc.getElementsByTagName("Relationship")) {
					rels.set(rel.getAttribute("Id"), {
						type: rel.getAttribute("Type") || "",
						target: rel.getAttribute("Target") || ""
					});
				}
			}
		}

		// Разрешение target: "worksheets/sheet1.xml" -> "xl/worksheets/sheet1.xml",
		// "/xl/..." (ведущий слэш) — уже абсолютный от корня архива
		const resolve = t => {
			if (!t) return null;
			if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return null; // внешняя ссылка
			if (t.startsWith("/")) return t.replace(/^\/\//, "");
			return wbBase + t;
		};

		// Первый worksheet
		let sheetTarget = null;
		for (const s of wbDoc.getElementsByTagName("sheet")) {
			const rid = s.getAttribute("r:id");
			const r = rid && rels.get(rid);
			if (r && /worksheet/i.test(r.type)) { sheetTarget = resolve(r.target); break; }
		}
		if (!sheetTarget) return null;

		// sharedStrings (если есть)
		let ssTarget = null;
		for (const r of rels.values()) {
			if (/sharedStrings/i.test(r.type)) { ssTarget = resolve(r.target); break; }
		}

		// Общие строки
		let shared = null;
		if (ssTarget) {
			const ssXml = await readEntry(ssTarget);
			const ssDoc = parseXml(ssXml);
			if (ssDoc) {
				shared = [];
				const sis = ssDoc.getElementsByTagName("si");
				for (const si of sis) {
					let s = "";
					const ts = si.getElementsByTagName("t");
					for (const el of ts) s += el.textContent || "";
					shared.push(s);
				}
			}
		}

		// Ячейки листа -> массив строк (как у CSV/XLS)
		const sheetXml = await readEntry(sheetTarget);
		const sDoc = parseXml(sheetXml);
		if (!sDoc) return null;

		const cellsRows = [];
		const rowEls = sDoc.getElementsByTagName("row");
		for (const row of rowEls) {
			const r = parseInt(row.getAttribute("r") || "0", 10);
			if (r < 1) continue;
			const cells = [];
			const cEls = row.getElementsByTagName("c");
			for (const c of cEls) {
				const idx = colIndexOf(c.getAttribute("r") || "");
				cells[idx] = xlsxCellValue(c, shared);
			}
			cellsRows[r - 1] = cells;
		}
		if (cellsRows.length < 2) return null;

		// Строка заголовков — первая из первых 6 строк, где есть
		// "наименование" или "код"
		let headerIdx = 0;
		for (let i = 0; i < Math.min(6, cellsRows.length); i++) {
			const row = cellsRows[i] || [];
			if (row.some(c => /^(наименование|код)$/i.test(String(c).trim()))) { headerIdx = i; break; }
		}

		// Колонки: имя ("наименование", иначе "код") и цена ("цена с ндс"/"цена"/"byn")
		const headers = (cellsRows[headerIdx] || []).map(h => String(h).trim().toLowerCase());
		let nameCol = 0;
		const nameIdx = headers.findIndex(h => h === "наименование");
		if (nameIdx > -1) nameCol = nameIdx;
		else {
			const codeIdx = headers.findIndex(h => h === "код" || h.includes("код"));
			if (codeIdx > -1) nameCol = codeIdx;
		}
		const priceIdx = headers.findIndex(h => /цена\s*с\s*ндс|^цена$|^byn$/.test(h));
		const priceCol = priceIdx > -1 ? priceIdx : null;

		// Колонка характеристик/описания (для извлечения сокета, памяти, TDP)
		const descIdx = headers.findIndex(h => /характеристик|описан/i.test(h));
		const descCol = descIdx > -1 ? descIdx : -1;

		// Колонка «Резерв» — позиции со значением «В резерве»
		const reserveIdx = headers.findIndex(h => /резерв/i.test(h));
		const reserveCol = reserveIdx > -1 ? reserveIdx : -1;

		// Для выгрузки заказа поставщику сохраняем строки шапки как в исходном прайсе
		const parsed = rowsToCatalog(cellsRows, { headerIdx, nameCol, priceCol, descCol, reserveCol });
		if (parsed) parsed.headerRows = cellsRows.slice(0, headerIdx + 1);
		return parsed;
	} catch (e) {
		return null;
	}
}

// ===== Связка select-ов с полями результатов =====
const componentConfig = [
	{ selectId: "cpu", resultName: "result-cpu", resultPrice: "result-cpu-price", label: "Процессор (CPU)" },
	{ selectId: "gpu", resultName: "result-gpu", resultPrice: "result-gpu-price", label: "Видеокарта (GPU)" },
	{ selectId: "motherboard", resultName: "result-motherboard", resultPrice: "result-motherboard-price", label: "Материнская плата" },
	{ selectId: "ram", resultName: "result-ram", resultPrice: "result-ram-price", label: "Оперативная память (RAM)" },
	{ selectId: "ssd", resultName: "result-ssd", resultPrice: "result-ssd-price", label: "SSD (накопитель)" },
	{ selectId: "hdd", resultName: "result-hdd", resultPrice: "result-hdd-price", label: "HDD (жёсткий диск)" },
	{ selectId: "psu", resultName: "result-psu", resultPrice: "result-psu-price", label: "Блок питания (PSU)" },
	{ selectId: "cooler", resultName: "result-cooler", resultPrice: "result-cooler-price", label: "Кулер для процессора" },
	{ selectId: "case", resultName: "result-case", resultPrice: "result-case-price", label: "Корпус" }
];

const comboboxes = {};
const resultNames = {};
const resultPrices = {};

// Показывать ли позиции из резерва (по умолчанию скрыты, чтобы не попадались часто)
let showReserves = false;

// Количество одинаковых позиций для категорий, где допустимо несколько штук
// (2 планки памяти, 2 SSD и т.п.). Значение из селектора «Кол-во» рядом с комбобоксом.
const quantities = { ram: 1, ssd: 1 };

// ===== Форматирование цены в рубли =====
function formatPrice(price) {
	return price.toLocaleString("ru-RU") + " ₽";
}

// ===== Заполнение выпадающих списков из каталога =====
function fillSelects() {
	componentConfig.forEach(item => {
		resultNames[item.selectId] = document.getElementById(item.resultName);
		resultPrices[item.selectId] = document.getElementById(item.resultPrice);
	});

	// Статичные категории (не зависят от выбора) заполняем целиком
	["cpu", "gpu", "hdd", "case"].forEach(cat => {
		comboboxes[cat].render(catalog[cat]);
	});

	// Зависимые категории — с применением фильтров совместимости
	updateCatalog();
}

// ===== Получение выбранного компонента из каталога =====
function getSelectedComponent(category) {
	return comboboxes[category].getSelectedItem();
}

// Отображаемое имя компонента: позиции из резерва помечаем «(резерв)»
function itemDisplayName(item) {
	if (!item) return "";
	return item.reserved ? item.name + " (резерв)" : item.name;
}

// ===== Комбобокс с поиском =====
class Combobox {
	constructor(category, onChange) {
		this.category = category;
		this.items = [];
		this.selectedValue = "";
		this.filter = "";
		this.filteredItems = [];
		this.highlightedIndex = 0;
		this.onChange = onChange;

		this.root = document.querySelector(`.combobox[data-category="${category}"]`);
		this.toggle = this.root.querySelector(".combobox-toggle");
		this.valueEl = this.root.querySelector(".combobox-value");
		this.menu = this.root.querySelector(".combobox-menu");
		this.search = this.root.querySelector(".combobox-search");
		this.list = this.root.querySelector(".combobox-list");
		this.emptyEl = this.root.querySelector(".combobox-empty");

		this.toggle.addEventListener("click", e => {
			e.stopPropagation();
			this.isOpen() ? this.close() : this.open();
		});
		this.search.addEventListener("input", () => {
			this.filter = this.search.value.trim().toLowerCase();
			this.highlightedIndex = 0;
			this.renderOptions();
		});
		this.search.addEventListener("keydown", e => this.handleKey(e));
		this.list.addEventListener("click", e => {
			const btn = e.target.closest(".combobox-option");
			if (!btn || btn.disabled) return;
			this.selectByValue(btn.dataset.value);
		});
		// Закрытие по клику вне комбобокса (клик внутри меню/поиска меню не закрывает)
		document.addEventListener("click", e => {
			if (!this.root.contains(e.target)) this.close();
		});
	}

	isOpen() { return !this.menu.hidden; }

	open() {
		// Закрываем другие открытые комбобоксы
		document.querySelectorAll(".combobox-menu").forEach(m => { m.hidden = true; });
		this.search.value = "";
		this.filter = "";
		this.highlightedIndex = 0;
		this.renderOptions();
		this.menu.hidden = false;
		this.toggle.setAttribute("aria-expanded", "true");
		this.search.focus();
	}

	close() {
		this.menu.hidden = true;
		this.toggle.setAttribute("aria-expanded", "false");
	}

	// Перезаполнение списка. Комплектующие сортируются по цене (сначала дешевле).
	// Выбор сохраняется, если выбранный компонент остался в списке (например,
	// при обновлении совместимых позиций после смены CPU/GPU — чтобы не сбрасывать
	// уже выбранную плату/память/БП/кулер, которые по-прежнему подходят).
	render(items) {
		const prev = this.selectedValue;
		this.items = (items || []).slice().sort((a, b) => a.price - b.price);
		this.selectedValue = prev && this.items.some(i => i.name === prev) ? prev : "";
		this.updateToggle();
		this.renderOptions();
	}

	renderOptions() {
		// Резервы скрыты, пока не включён чек-бокс «Резервы»
		let base = this.items;
		if (!showReserves) {
			base = base.filter(i => !i.reserved);
		}
		const filtered = this.filter
			? base.filter(i => i.name.toLowerCase().includes(this.filter))
			: base;
		this.filteredItems = filtered;

		this.list.innerHTML = "";

		// Нет совместимых — заглушка
		if (this.items.length === 0) {
			const msg = document.createElement("div");
			msg.className = "combobox-option combobox-option-disabled";
			msg.textContent = "Нет совместимых компонентов";
			this.list.appendChild(msg);
			this.emptyEl.hidden = true;
			return;
		}

		// Все позиции скрыты фильтром резервов — подсказка, как их показать
		if (base.length === 0) {
			const msg = document.createElement("div");
			msg.className = "combobox-option combobox-option-disabled";
			msg.textContent = "Все позиции в резерве — включите «Резервы»";
			this.list.appendChild(msg);
			this.emptyEl.hidden = true;
			return;
		}

		this.emptyEl.hidden = filtered.length > 0;

		if (this.highlightedIndex >= filtered.length) this.highlightedIndex = filtered.length - 1;
		if (this.highlightedIndex < 0) this.highlightedIndex = 0;

		filtered.forEach((item, idx) => {
			const btn = document.createElement("button");
			btn.type = "button";
			btn.className = "combobox-option";
			if (idx === this.highlightedIndex) btn.classList.add("highlighted");
			if (item.name === this.selectedValue) btn.classList.add("selected");
			btn.dataset.value = item.name;
			if (item.reserved) btn.classList.add("reserved");

			// Цена — в начале строки
			const price = document.createElement("span");
			price.className = "option-price";
			price.textContent = formatPrice(item.price);
			const name = document.createElement("span");
			name.className = "option-name";
			name.textContent = item.name;
			btn.append(price, name);
			// Пометка о встроенном видеоядре для процессоров
			if (this.category === "cpu") {
				const igpu = hasIntegratedGPU(item);
				const b = document.createElement("span");
				b.className = "igpu-badge " + (igpu ? "igpu-yes" : "igpu-no");
				b.textContent = igpu ? "видео есть" : "без видео";
				btn.append(b);
			}
			if (item.reserved) {
				// Пометка «резерв» справа в строке
				const badge = document.createElement("span");
				badge.className = "reserved-badge";
				badge.textContent = "резерв";
				btn.append(badge);
			}
			this.list.appendChild(btn);
		});
	}

	handleKey(e) {
		const list = this.filteredItems;
		if (e.key === "ArrowDown") {
			e.preventDefault();
			if (this.highlightedIndex < list.length - 1) {
				this.highlightedIndex++;
				this.renderOptions();
				this.scrollHighlighted();
			}
		} else if (e.key === "ArrowUp") {
			e.preventDefault();
			if (this.highlightedIndex > 0) {
				this.highlightedIndex--;
				this.renderOptions();
				this.scrollHighlighted();
			}
		} else if (e.key === "Enter") {
			e.preventDefault();
			const item = list[this.highlightedIndex];
			if (item) this.selectByValue(item.name);
		} else if (e.key === "Escape") {
			this.close();
			this.toggle.focus();
		}
	}

	scrollHighlighted() {
		const opt = this.list.querySelector(".combobox-option.highlighted");
		if (opt) opt.scrollIntoView({ block: "nearest" });
	}

	selectByValue(value) {
		this.selectedValue = value;
		this.updateToggle();
		this.close();
		if (this.onChange) this.onChange(this.category);
	}

	// Установка значения без сброса списка (для сброса формы)
	setValue(value) {
		this.selectedValue = value;
		this.updateToggle();
	}

	getValue() { return this.selectedValue; }

	getSelectedItem() {
		if (!this.selectedValue) return null;
		return this.items.find(i => i.name === this.selectedValue) || null;
	}

	updateToggle() {
		if (this.selectedValue) {
			const item = this.items.find(i => i.name === this.selectedValue);
			if (item) {
				this.valueEl.textContent = "";
				this.valueEl.classList.remove("placeholder");
				// Количество (для RAM/SSD): показываем «2 × цена» и «2 × название»
				const qty = quantities[this.category] || 1;
				// Цена — в начале строки
				const price = document.createElement("span");
				price.className = "toggle-price";
				price.textContent = qty > 1 ? formatPrice(item.price * qty) : formatPrice(item.price);
				const name = document.createElement("span");
				name.className = "toggle-name";
				name.textContent = (qty > 1 ? qty + " × " : "") +
					(item.reserved ? item.name + " (резерв)" : item.name);
				this.toggle.classList.toggle("reserved", !!item.reserved);
				this.valueEl.append(price, name);
				return;
			}
		}
		this.toggle.classList.remove("reserved");
		this.valueEl.textContent = "Выберите компонент...";
		this.valueEl.classList.add("placeholder");
	}
}

// ===== Обновление каталога при смене процессора =====
// Очищает списки плат, ОЗУ и SSD, оставляя только совместимые позиции
function updateCatalog() {
	const cpu = getSelectedComponent("cpu");

	// 1. Материнские платы — по совпадению сокета И поколения памяти с выбранным CPU
	//    (для LGA1700 memoryType "ANY" — подходят оба поколения)
	const mobos = cpu
		? catalog.motherboard.filter(m =>
			m.socket === cpu.socket &&
			(cpu.memoryType === "ANY" || m.memoryType === cpu.memoryType))
		: catalog.motherboard;
	comboboxes["motherboard"].render(mobos);

	// 2. Оперативная память — по поколению (DDR4/DDR5) CPU и материнской платы
	updateRAMList();

	// 3. SSD — показываем все (фильтр по интерфейсу добавим позже)
	updateSSDList();

	// 4. Кулеры — по TDP процессора
	updateCoolerList();

	// 5. Блок питания — по потреблению сборки (CPU + GPU)
	updatePSUList();
}

// ===== Обновление списка БП по потреблению сборки =====
// Потребление = TDP процессора + потребление видеокарты + ~75W на остальное
// (материнская плата, память, накопители, вентиляторы). БП должен иметь
// запас ~30% от расчётного потребления. Если данные неизвестны (нет TDP у CPU
// или модель GPU не в таблице) — БП не фильтруем.
function updatePSUList() {
	const cpu = getSelectedComponent("cpu");
	const gpu = getSelectedComponent("gpu");

	let power = 75; // базовая нагрузка остальных компонентов
	let known = false;
	if (cpu && cpu.tdp) { power += cpu.tdp; known = true; }
	if (gpu && gpu.power) { power += gpu.power; known = true; }

	let psus = catalog.psu;
	if (known) {
		// Запас ~30%: БП не должен работать на пределе
		const minPower = Math.ceil(power * 1.3);
		psus = psus.filter(p => !p.power || p.power >= minPower);
	}
	comboboxes["psu"].render(psus);
}

// ===== Обновление списка кулеров по TDP процессора =====
// Кулер должен рассеивать мощность не меньше TDP процессора (например,
// процессор 65W → подходят кулеры с TDP 65W+). Если TDP кулера не указан
// (например, некоторые СЖО) — считаем его подходящим.
function updateCoolerList() {
	const cpu = getSelectedComponent("cpu");
	let coolers = catalog.cooler;
	if (cpu && cpu.tdp) {
		coolers = coolers.filter(c => !c.tdp || c.tdp >= cpu.tdp);
	}
	comboboxes["cooler"].render(coolers);
}

// ===== Обновление списка RAM при смене CPU или материнской платы =====
function updateRAMList() {
	const cpu = getSelectedComponent("cpu");
	const mobo = getSelectedComponent("motherboard");

	// Собираем допустимые поколения памяти: плата имеет приоритет (она задаёт тип),
	// иначе ориентируемся на процессор
	const allowedTypes = new Set();
	if (mobo) {
		allowedTypes.add(mobo.memoryType);
	} else if (cpu) {
		if (cpu.memoryType === "ANY") {
			// LGA1700: подходят и DDR4, и DDR5
			allowedTypes.add("DDR4");
			allowedTypes.add("DDR5");
		} else {
			allowedTypes.add(cpu.memoryType);
		}
	}

	let ram = catalog.ram;
	if (allowedTypes.size > 0) {
		ram = ram.filter(r => allowedTypes.has(r.memoryType));
	}
	comboboxes["ram"].render(ram);
}

// ===== Обновление списка SSD =====
function updateSSDList() {
	comboboxes["ssd"].render(catalog.ssd);
	// Фильтрация по интерфейсу (M.2/SATA) будет добавлена позже
}

// ===== Есть ли встроенное видеоядро (iGPU) в процессоре =====
// Intel: Core без суффикса F/KF имеют встроенную графику UHD
//        («i5-12400F» — нет, «i5-12400» — есть). Xeon — видеоядра нет.
// AMD:   Ryzen с суффиксом G/GE/GT («5600G», «8600G», «5600GT») — есть.
//        Ryzen 7000/8000/9000 серии (7xxx/8xxx/9xxx) — есть (встроенная RDNA 2),
//        кроме F-вариантов («Ryzen 5 7500F», «Ryzen 5 8400F» — нет).
//        Ryzen 1xxx–5xxx без G — видеоядра нет («5600», «5800X3D»).
//        Athlon («200GE», «3000G») — есть.
// Если определить не удалось — считаем, что видео есть (не предупреждаем лишнего).
function hasIntegratedGPU(cpu) {
	if (!cpu) return true;
	const t = ((cpu.name || "") + " " + (cpu.desc || "")).toLowerCase();

	// Серверные процессоры — без встроенного видео
	if (/\b(?:xeon|epyc|threadripper|opteron)\b/.test(t)) return false;

	// AMD Ryzen
	if (/\bryzen\b/.test(t)) {
		// F / GF суффикс — без видео («7500F», «8400F»)
		if (/\b\d{4,5}(?:f|gf)\b/.test(t)) return false;
		// G / GE / GT суффикс — есть («5600G», «8600G», «5600GT»)
		if (/\b\d{4,5}(?:g|ge|gt)\b/.test(t)) return true;
		// Серия по первой цифре модели: 7xxx и новее — встроенная графика RDNA 2
		const m = t.match(/\bryzen\s+\w+\s+(\d{4})/);
		if (m && parseInt(m[1][0], 10) >= 7) return true;
		return false;
	}

	// AMD Athlon с G/GE — есть видео (200GE, 3000G)
	if (/\bathlon\b/.test(t)) return true;

	// Intel Core: суффикс F/KF — без видео
	if (/\bcore\b/.test(t)) {
		if (/\bi[3579]-\d{4,5}(?:kf|f)\b/.test(t)) return false;
		return true;
	}

	// Pentium / Celeron — есть встроенная графика
	if (/\b(?:pentium|celeron)\b/.test(t)) return true;

	// Неизвестно — считаем, что видео есть
	return true;
}

// ===== Расчёт стоимости =====
function calculate() {
	let total = 0;
	let markupTotal = 0;
	let selectedCount = 0;
	const selectedCats = new Set();
	const markupPercent = getMarkupPercent();

	componentConfig.forEach(item => {
		const selected = comboboxes[item.selectId].getSelectedItem();
		const hasValue = !!selected;
		if (hasValue) selectedCats.add(item.selectId);

		// Количество (для RAM/SSD) умножает цену позиции
		const qty = hasValue ? (quantities[item.selectId] || 1) : 0;
		const lineTotal = hasValue ? selected.price * qty : 0;

		const nameEl = resultNames[item.selectId];
		if (hasValue) {
			let nameText = (qty > 1 ? qty + " × " : "") + itemDisplayName(selected);
			// Процессор без встроенного видеоядра — явная пометка
			if (item.selectId === "cpu" && !hasIntegratedGPU(selected)) {
				nameText += " (без встроенного видео)";
			}
			nameEl.textContent = item.label + ": " + nameText;
			nameEl.classList.remove("not-selected");
			nameEl.classList.toggle("reserved", !!selected.reserved);
			resultPrices[item.selectId].textContent = formatPrice(lineTotal);
			total += lineTotal;
			markupTotal += clientPrice(lineTotal, markupPercent);
			selectedCount++;
		} else {
			nameEl.textContent = item.label + ": Не выбрано";
			nameEl.classList.add("not-selected");
			nameEl.classList.remove("reserved");
			resultPrices[item.selectId].textContent = "—";
		}
	});

	document.getElementById("results-counter").textContent =
		"Выбрано " + selectedCount + " из " + componentConfig.length + " компонентов";
	document.getElementById("results-list").hidden = selectedCount === 0;
	document.getElementById("results-placeholder").hidden = selectedCount > 0;

	// Итог в бейдже верхней панели: сумма без наценки + сумма с наценкой
	updateTotalBadges(selectedCount > 0 ? total : null, selectedCount > 0 ? markupTotal : null);

	// Ненавязчивое предупреждение: не хватает компонентов для полноценного ПК.
	// Показывается только при частичной сборке и НЕ влияет на экспорт.
	const missing = [];
	const requiredMap = [
		{ cat: "cpu", label: "процессор" },
		{ cat: "ram", label: "оперативная память" },
		{ cat: "motherboard", label: "материнская плата" },
		{ cat: "psu", label: "блок питания" },
		{ cat: "cooler", label: "кулер" },
		{ cat: "case", label: "корпус" },
		{ cat: "gpu", label: "видеокарта" }
	];
	// Накопитель: достаточно SSD или HDD
	const hasStorage = selectedCats.has("ssd") || selectedCats.has("hdd");
	const caseSel = getSelectedComponent("case");
	const cpuSel = getSelectedComponent("cpu");
	// Встроенный БП корпуса заменяет отдельный блок питания
	const builtinPsu = caseSel && caseSel.builtInPsuPower ? caseSel.builtInPsuPower : 0;
	requiredMap.forEach(({ cat, label }) => {
		if (cat === "psu" && builtinPsu) return;
		// Видеокарта не обязательна, если в процессоре есть встроенное видеоядро
		if (cat === "gpu" && cpuSel && hasIntegratedGPU(cpuSel)) return;
		if (!selectedCats.has(cat)) {
			if (cat === "gpu" && cpuSel) {
				missing.push("видеокарта — в процессоре нет встроенного видеоядра");
			} else {
				missing.push(label);
			}
		}
	});
	if (!hasStorage) missing.push("накопитель (SSD/HDD)");

	const warnEl = document.getElementById("results-warning");
	if (selectedCount > 0 && missing.length > 0) {
		warnEl.textContent = "⚠ Не хватает: " + missing.join(", ") + " — сборка неполная";
		warnEl.hidden = false;
	} else {
		warnEl.hidden = true;
	}

	// Проверка «слепых зон» совместимости: встроенный БП в корпусе, длина
	// видеокарты, высота кулера, радиатор СЖО. Срабатывает только когда
	// известны обе величины (нет данных — проверку пропускаем).
	const compat = [];
	const gpuSel = getSelectedComponent("gpu");
	const psuSel = getSelectedComponent("psu");
	const coolerSel = getSelectedComponent("cooler");

	if (caseSel) {
		if (caseSel.builtInPsuPower) {
			if (psuSel) {
				compat.push("В корпусе встроенный БП (" + caseSel.builtInPsuPower + " Вт) — отдельный блок питания лишний");
			} else {
				// Хватает ли встроенного БП (если известна нагрузка сборки)
				let need = 75;
				let needKnown = false;
				if (cpuSel && cpuSel.tdp) { need += cpuSel.tdp; needKnown = true; }
				if (gpuSel && gpuSel.power) { need += gpuSel.power; needKnown = true; }
				if (needKnown && caseSel.builtInPsuPower < Math.ceil(need * 1.3)) {
					compat.push("Встроенный БП корпуса (" + caseSel.builtInPsuPower + " Вт) слабоват — желательно ≥ " + Math.ceil(need * 1.3) + " Вт");
				}
			}
		}
		if (gpuSel && gpuSel.length && caseSel.gpuMaxLen && gpuSel.length > caseSel.gpuMaxLen) {
			compat.push("Видеокарта " + gpuSel.length + " мм не поместится в корпус (макс. " + caseSel.gpuMaxLen + " мм)");
		}
		if (coolerSel && coolerSel.height && caseSel.cpuMaxHeight && coolerSel.height > caseSel.cpuMaxHeight) {
			compat.push("Кулер высотой " + coolerSel.height + " мм не поместится в корпус (макс. " + caseSel.cpuMaxHeight + " мм)");
		}
		if (coolerSel && coolerSel.radiator && caseSel.radiatorMax && coolerSel.radiator > caseSel.radiatorMax) {
			compat.push("Радиатор СЖО " + coolerSel.radiator + " мм не поместится в корпус (макс. " + caseSel.radiatorMax + " мм)");
		}
	}

	const compatEl = document.getElementById("results-compat");
	if (compatEl) {
		if (selectedCount > 0 && compat.length > 0) {
			compatEl.textContent = "⚠ " + compat.join("; ");
			compatEl.hidden = false;
		} else {
			compatEl.hidden = true;
		}
	}
}

// ===== Сброс всех select-ов в исходное состояние =====
function resetAll() {
	componentConfig.forEach(item => {
		comboboxes[item.selectId].setValue("");
	});
	// Сбрасываем количество для RAM/SSD
	Object.keys(quantities).forEach(cat => {
		quantities[cat] = 1;
		const qtyEl = document.getElementById("qty-" + cat);
		if (qtyEl) qtyEl.value = "1";
	});
	document.getElementById("results-list").hidden = true;
	document.getElementById("results-placeholder").hidden = false;
	document.getElementById("results-counter").textContent = "";
	document.getElementById("results-warning").hidden = true;
	const compatResetEl = document.getElementById("results-compat");
	if (compatResetEl) compatResetEl.hidden = true;
	updateTotalBadges(null, null);

	// Возвращаем полный каталог без фильтров
	updateCatalog();
}

// Обновление бейджа «Итого (с наценкой)» в панели действий:
// формат «Итого (с наценкой): 100 ₽ (110 ₽)», сумма с наценкой выделена цветом
function updateTotalBadges(total, markupTotal) {
	const el = document.getElementById("total-actions");
	if (!el) return;
	const base = el.querySelector(".total-base");
	const markup = el.querySelector(".total-markup");
	if (base) base.textContent = total == null ? "—" : formatPrice(total);
	if (markup) markup.textContent = total == null ? "" : "(" + formatPrice(markupTotal) + ")";
}

// ===== Обработка загруженного прайс-листа (XLS / XLSX) =====
function handlePriceFile(event) {
	const file = event.target.files[0];
	if (!file) return;

	const statusEl = document.getElementById("load-status");
	const reader = new FileReader();

	reader.onload = async ev => {
		const bytes = new Uint8Array(ev.target.result);

		// Сигнатура XLSX (ZIP): PK\x03\x04
		const isXlsx = bytes.length >= 4 &&
			bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04;
		// Сигнатура бинарного XLS (OLE2/CFB): D0 CF 11 E0 A1 B1 1A E1
		const isXls = bytes.length >= 8 &&
			bytes[0] === 0xD0 && bytes[1] === 0xCF && bytes[2] === 0x11 && bytes[3] === 0xE0 &&
			bytes[4] === 0xA1 && bytes[5] === 0xB1 && bytes[6] === 0x1A && bytes[7] === 0xE1;

		let parsed = null;
		if (isXlsx) {
			statusEl.textContent = "⏳ Чтение XLSX…";
			parsed = await parseXLSX(ev.target.result);
		} else if (isXls) {
			parsed = parseXLS(ev.target.result);
		} else {
			statusEl.textContent = "⚠ Неподдерживаемый формат файла (поддерживаются XLS и XLSX)";
			statusEl.className = "load-status error";
			return;
		}

		// headerRows (шапка прайса) хранится отдельно и в подсчёт позиций не входит
		const CATEGORY_KEYS = ["cpu", "gpu", "motherboard", "ram", "ssd", "hdd", "psu", "cooler", "case"];
		const totalItems = parsed
			? CATEGORY_KEYS.reduce((s, cat) => s + (parsed[cat] ? parsed[cat].length : 0), 0)
			: 0;

		if (!parsed || totalItems === 0) {
			statusEl.textContent = "⚠ Не удалось найти компоненты в файле";
			statusEl.className = "load-status error";
			return;
		}

		// Сохраняем исходные данные в каталог
		Object.assign(catalog, parsed);
		fillSelects();

		statusEl.textContent = "✓ Загружено: " + file.name + " (" + totalItems + " позиций)";
		statusEl.className = "load-status ok";
		event.target.value = ""; // позволяет загрузить тот же файл повторно
	};

	reader.onerror = () => {
		statusEl.textContent = "⚠ Ошибка чтения файла";
		statusEl.className = "load-status error";
	};

	reader.readAsArrayBuffer(file);
}

// ===== Сбор выбранных компонентов для выгрузки =====
function collectSelectedBuild() {
	const markupPercent = getMarkupPercent();
	const selected = componentConfig
		.map(item => {
			const sel = comboboxes[item.selectId].getSelectedItem();
			if (!sel) return null;
			// Количество (для RAM/SSD): цена позиции умножается, в названии префикс «2 × »
			const qty = quantities[item.selectId] || 1;
			const linePrice = sel.price * qty;
			return {
				category: item.selectId,
				label: item.label,
				name: (qty > 1 ? qty + " × " : "") + itemDisplayName(sel),
				price: linePrice,
				clientPrice: clientPrice(linePrice, markupPercent),
				row: sel.row,
				rowIndex: sel.rowIndex,
				qty
			};
		})
		.filter(Boolean);

	if (selected.length === 0) {
		alert("Сначала выберите компоненты сборки.");
		return null;
	}

	return {
		selected,
		markupPercent,
		total: Math.round(selected.reduce((s, c) => s + c.price, 0) * 100) / 100,
		clientTotal: selected.reduce((s, c) => s + c.clientPrice, 0)
	};
}

// Экранирование спецсимволов XML (для Excel)
function xmlEscape(s) {
	return String(s)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// Скачивание Blob как файла
function downloadBlob(blob, filename) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

// ===== Наценка и цены для клиента =====

// Текущий процент наценки из поля ввода (0, если пусто/отрицательно)
function getMarkupPercent() {
	const v = parseFloat(document.getElementById("markup-percent").value);
	return isNaN(v) || v < 0 ? 0 : v;
}

// Цена для клиента: цена × наценка, округлённая вверх до 10 руб.
// (например 1357,4 → 1360).
function clientPrice(price, percent) {
	const raw = price * (1 + (percent || 0) / 100);
	return Math.ceil(raw / 10) * 10;
}

// ===== Выгрузка для клиента (печать/PDF) =====
// Открывает системный диалог печати — в нём можно выбрать «Сохранить как PDF».
// В документе цены показаны с наценкой и округлены до 10 руб. в большую сторону.
// Печатная версия формируется в скрытой области #print-area (см. @media print в style.css).
function exportClient() {
	const build = collectSelectedBuild();
	if (!build) return;

	const area = document.getElementById("print-area");
	const date = new Date().toLocaleDateString("ru-RU");

	let html = "<h1>Сборка ПК — конфигуратор</h1>";
	html += "<p class=\"print-date\">Дата: " + date +
		" · Выбрано " + build.selected.length + " из " + componentConfig.length + " компонентов</p>";
	html += "<table><thead><tr><th>№</th><th>Категория</th><th>Компонент</th></tr></thead><tbody>";

	build.selected.forEach((c, i) => {
		html += "<tr><td class=\"num\">" + (i + 1) +
			"</td><td>" + xmlEscape(c.label) +
			"</td><td>" + xmlEscape(c.name) + "</td></tr>";
	});

	html += "</tbody></table>";

	// Итоговая сумма (цены комплектующих клиенту не показываем)
	html += "<p class=\"print-total\">Итого: <strong>" +
		formatPrice(build.clientTotal) + "</strong></p>";

	area.innerHTML = html;
	window.print();
	area.innerHTML = "";
}

// ===== Выгрузка заказа в Excel (.xls) =====
// Файл для отправки поставщику: повторяет строки исходного прайса —
// шапка (все строки до строки заголовков включительно) и выбранные
// позиции теми же строчками, в том же порядке, как в прайсе.
// Формат SpreadsheetML (Excel 2003 XML) открывается в Excel/LibreOffice
// без внешних библиотек.
function exportExcel() {
	const build = collectSelectedBuild();
	if (!build) return;

	// Шапка из исходного прайса + выбранные позиции в порядке прайса.
	// Позиции с количеством > 1 (RAM/SSD) дублируются нужное число раз —
	// поставщику уходит столько строк, сколько единиц заказываем.
	const headerRows = catalog.headerRows || [];
	const orderRows = headerRows.concat(
		build.selected
			.slice()
			.sort((a, b) => (a.rowIndex || 0) - (b.rowIndex || 0))
			.flatMap(c => Array(Math.max(1, c.qty || 1)).fill(c.row))
	);

	// Количество колонок — как в самой широкой строке (обычно шапка)
	const maxCols = orderRows.reduce((m, r) => Math.max(m, r ? r.length : 0), 0);

	// Колонки цен — по заголовкам исходного прайса ("Цена с НДС", "BYN", "РРЦ" и т.п.).
	// Их значения выводим как числа (ss:Type="Number"), чтобы Excel не считал
	// "544.08" текстом, а показал "544,08" по русской локали.
	const priceCols = new Set();
	const headerRow = headerRows.length > 0 ? (headerRows[headerRows.length - 1] || []) : [];
	headerRow.forEach((h, ci) => {
		if (/цена|byn|ррц|price/i.test(String(h ?? ""))) priceCols.add(ci);
	});

	const rows = orderRows.map(r => {
		if (!r) return "<Row></Row>";
		let cells = "";
		for (let ci = 0; ci < maxCols; ci++) {
			const v = ci < r.length ? String(r[ci] ?? "") : "";
			if (priceCols.has(ci)) {
				const num = parseFloat(v.replace(/\s/g, "").replace(",", "."));
				if (!isNaN(num)) {
					cells += "<Cell><Data ss:Type=\"Number\">" + num + "</Data></Cell>";
					continue;
				}
			}
			cells += "<Cell><Data ss:Type=\"String\">" + xmlEscape(v) + "</Data></Cell>";
		}
		return "<Row>" + cells + "</Row>";
	});

	const xml = "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n" +
		"<?mso-application progid=\"Excel.Sheet\"?>\n" +
		"<Workbook xmlns=\"urn:schemas-microsoft-com:office:spreadsheet\"\n" +
		" xmlns:o=\"urn:schemas-microsoft-com:office:office\"\n" +
		" xmlns:x=\"urn:schemas-microsoft-com:office:excel\"\n" +
		" xmlns:ss=\"urn:schemas-microsoft-com:office:spreadsheet\"\n" +
		" xmlns:html=\"http://www.w3.org/TR/REC-html40\">\n" +
		"<Styles>\n" +
		"<Style ss:ID=\"Default\" ss:Name=\"Normal\"><Alignment ss:Vertical=\"Bottom\"/><Font ss:FontName=\"Calibri\" ss:Size=\"11\"/></Style>\n" +
		"</Styles>\n" +
		"<Worksheet ss:Name=\"Заказ\">\n" +
		"<Table>\n" +
		rows.join("\n") + "\n" +
		"</Table>\n" +
		"</Worksheet>\n" +
		"</Workbook>";

	const blob = new Blob(["\ufeff" + xml], { type: "application/vnd.ms-excel;charset=utf-8" });
	downloadBlob(blob, "zakaz-" + new Date().toISOString().slice(0, 10) + ".xls");
}

// ===== Назначение обработчиков =====
document.getElementById("btn-calculate").addEventListener("click", calculate);
document.getElementById("btn-export-client").addEventListener("click", exportClient);
document.getElementById("btn-export-xls").addEventListener("click", exportExcel);
document.getElementById("btn-reset").addEventListener("click", resetAll);

// Изменение наценки пересчитывает сумму «С наценкой»
document.getElementById("markup-percent").addEventListener("input", calculate);

// Кнопка "Загрузить прайс-лист (CSV)" открывает выбор файла
const fileInput = document.getElementById("price-file-input");
document.getElementById("btn-load-price").addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", handlePriceFile);

// Чек-бокс «Резервы»: перерисовываем списки всех комбобоксов
const showReservesCheckbox = document.getElementById("show-reserves");
showReservesCheckbox.addEventListener("change", () => {
	showReserves = showReservesCheckbox.checked;
	Object.values(comboboxes).forEach(cb => cb.renderOptions());
});

// Селекторы «Кол-во» (RAM/SSD): пересчёт суммы и обновление названия/цены в кнопке
Object.keys(quantities).forEach(cat => {
	const qtyEl = document.getElementById("qty-" + cat);
	if (!qtyEl) return;
	qtyEl.addEventListener("change", () => {
		quantities[cat] = Math.max(1, parseInt(qtyEl.value, 10) || 1);
		qtyEl.value = String(quantities[cat]);
		comboboxes[cat].updateToggle();
		calculate();
	});
});

// ===== Инициализация при загрузке страницы =====
componentConfig.forEach(item => {
	comboboxes[item.selectId] = new Combobox(item.selectId, category => {
		// Смена процессора перестраивает списки плат, ОЗУ, SSD, кулеров и БП
		if (category === "cpu") {
			updateCatalog();
		}
		// Смена материнской платы перестраивает списки ОЗУ (по поколению) и SSD
		else if (category === "motherboard") {
			updateRAMList();
			updateSSDList();
		}
		// Смена видеокарты перестраивает список БП (по потреблению)
		else if (category === "gpu") {
			updatePSUList();
		}
	});
});

fillSelects();
