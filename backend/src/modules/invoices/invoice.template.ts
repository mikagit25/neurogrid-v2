// Generates a print-ready HTML invoice (Счёт на оплату).
// Served as text/html — user opens and prints to PDF via browser.

export interface InvoiceData {
  invoiceNumber: string;
  date: string;           // DD.MM.YYYY
  payerEmail: string;
  payerName?: string;
  payerUnp?: string;
  payerAddress?: string;
  payerIban?: string;
  payerBank?: string;
  payerBic?: string;
  payerPhone?: string;
  planName: string;
  months: number;
  amount: number;
}

const COMPANY = {
  name: 'Частное производственное унитарное предприятие «Первая Компания»',
  short: 'ЧП «Первая Компания»',
  address: '247710, Гомельская область, г. Калинковичи, ул. Геологов, 3',
  unp: '490556542',
  iban: 'BY71BLBB30120490556542001001',
  bank: 'ОАО «Белинвестбанк»',
  bic: 'BLBBBY2X',
  phones: '+375-29-6945071, +375-29-6035582',
  email: '6035582@gmail.com',
};

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function renderInvoiceHtml(data: InvoiceData): string {
  const unitPrice = data.amount;
  const total = unitPrice;
  const planLabel = data.planName === 'business' ? 'Бизнес' : data.planName === 'start' ? 'Старт' : data.planName;
  const serviceDesc = `Подписка NeuroGrid (тариф ${planLabel}), ${data.months} мес.`;

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Счёт на оплату ${data.invoiceNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #000; background: #fff; }
  .page { max-width: 210mm; margin: 10mm auto; padding: 15mm 20mm; }
  h2 { font-size: 16pt; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11pt; margin-bottom: 20px; color: #333; }
  .meta { margin-bottom: 18px; }
  .meta-row { display: flex; gap: 8px; margin-bottom: 6px; font-size: 11pt; }
  .meta-label { font-weight: bold; min-width: 100px; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 11pt; }
  th { background: #f0f0f0; border: 1px solid #999; padding: 6px 8px; text-align: center; font-weight: bold; }
  td { border: 1px solid #999; padding: 6px 8px; }
  td.num { text-align: center; }
  td.right { text-align: right; }
  .total-row td { font-weight: bold; background: #fafafa; }
  .note { font-size: 10pt; color: #555; margin-top: 10px; }
  .bank-block { margin-top: 20px; padding: 12px; border: 1px solid #ccc; font-size: 11pt; }
  .bank-block h3 { font-size: 12pt; margin-bottom: 10px; }
  .bank-row { display: flex; gap: 8px; margin-bottom: 5px; }
  .bank-label { font-weight: bold; min-width: 130px; }
  .footer { margin-top: 30px; font-size: 11pt; }
  .footer-row { display: flex; justify-content: space-between; margin-bottom: 20px; }
  .sign-block { flex: 1; }
  .sign-line { border-bottom: 1px solid #000; margin-top: 30px; width: 200px; }
  @media print {
    .page { margin: 0; padding: 10mm 15mm; }
    .no-print { display: none; }
  }
</style>
</head>
<body>
<div class="page">

  <div class="no-print" style="text-align:center;margin-bottom:16px;">
    <button onclick="window.print()" style="padding:8px 24px;font-size:13pt;cursor:pointer;background:#7c3aed;color:#fff;border:none;border-radius:6px;">
      Печать / Сохранить PDF
    </button>
  </div>

  <div style="text-align:center;margin-bottom:12px;">
    <div style="font-size:11pt;font-weight:bold;">${COMPANY.name}</div>
    <div style="font-size:10pt;color:#444;">${COMPANY.address} | УНП ${COMPANY.unp}</div>
    <div style="font-size:10pt;color:#444;">Тел: ${COMPANY.phones} | Email: ${COMPANY.email}</div>
  </div>

  <hr style="border:1.5px solid #000;margin:12px 0;">

  <h2>СЧЁТ НА ОПЛАТУ № ${data.invoiceNumber}</h2>
  <div class="subtitle">от ${data.date}</div>

  <div class="meta">
    <div class="meta-row"><span class="meta-label">Поставщик:</span><span>${COMPANY.name}, УНП ${COMPANY.unp}</span></div>
    <div class="meta-row"><span class="meta-label">Плательщик:</span><span>${data.payerName || data.payerEmail}${data.payerUnp ? ', УНП ' + data.payerUnp : ''}</span></div>
    ${data.payerAddress ? `<div class="meta-row"><span class="meta-label">Адрес плательщика:</span><span>${data.payerAddress}</span></div>` : ''}
    ${data.payerIban ? `<div class="meta-row"><span class="meta-label">IBAN плательщика:</span><span>${data.payerIban}${data.payerBank ? ', ' + data.payerBank : ''}${data.payerBic ? ', БИК ' + data.payerBic : ''}</span></div>` : ''}
    ${data.payerPhone ? `<div class="meta-row"><span class="meta-label">Телефон:</span><span>${data.payerPhone}</span></div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">№</th>
        <th>Наименование работ (услуг)</th>
        <th style="width:60px">Кол-во</th>
        <th style="width:60px">Ед.</th>
        <th style="width:110px">Цена, BYN</th>
        <th style="width:110px">Сумма, BYN</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="num">1</td>
        <td>${serviceDesc}</td>
        <td class="num">${data.months}</td>
        <td class="num">мес.</td>
        <td class="right">${fmt(unitPrice / data.months)}</td>
        <td class="right">${fmt(unitPrice)}</td>
      </tr>
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4"></td>
        <td style="text-align:right;border:1px solid #999;padding:6px 8px;font-weight:bold;">Итого:</td>
        <td class="right" style="border:1px solid #999;padding:6px 8px;font-weight:bold;">${fmt(total)} BYN</td>
      </tr>
    </tfoot>
  </table>

  <p class="note">НДС не облагается (упрощённая система налогообложения).</p>
  <p class="note" style="margin-top:6px;font-weight:bold;">
    Итого к оплате: ${fmt(total)} (${amountWords(total)}) белорусских рублей 00 копеек.
  </p>

  <div class="bank-block">
    <h3>Реквизиты для оплаты</h3>
    <div class="bank-row"><span class="bank-label">Получатель:</span><span>${COMPANY.name}</span></div>
    <div class="bank-row"><span class="bank-label">УНП:</span><span>${COMPANY.unp}</span></div>
    <div class="bank-row"><span class="bank-label">IBAN:</span><span>${COMPANY.iban}</span></div>
    <div class="bank-row"><span class="bank-label">Банк:</span><span>${COMPANY.bank}</span></div>
    <div class="bank-row"><span class="bank-label">БИК:</span><span>${COMPANY.bic}</span></div>
    <div class="bank-row" style="margin-top:8px;font-size:10pt;color:#555;">
      <span>В назначении платежа укажите: «Оплата по счёту № ${data.invoiceNumber} за услуги NeuroGrid»</span>
    </div>
  </div>

  <div class="footer">
    <div class="footer-row">
      <div class="sign-block">
        <div>Руководитель</div>
        <div class="sign-line"></div>
        <div style="font-size:10pt;color:#555;margin-top:4px;">подпись / расшифровка</div>
      </div>
      <div class="sign-block">
        <div>Главный бухгалтер</div>
        <div class="sign-line"></div>
        <div style="font-size:10pt;color:#555;margin-top:4px;">подпись / расшифровка</div>
      </div>
    </div>
    <p style="font-size:10pt;color:#777;">Счёт действителен в течение 30 банковских дней с даты выставления.</p>
  </div>

</div>
</body>
</html>`;
}

// Simple Russian number-to-words for whole BYN amounts (up to 1 000 000)
function amountWords(amount: number): string {
  const n = Math.floor(amount);
  if (n === 0) return 'ноль';

  const ones = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];

  function threeDigits(x: number, fem: boolean): string {
    const parts: string[] = [];
    const h = Math.floor(x / 100);
    const rem = x % 100;
    if (h) parts.push(hundreds[h]);
    if (rem >= 10 && rem < 20) {
      parts.push(teens[rem - 10]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      if (t) parts.push(tens[t]);
      if (o) {
        if (fem) {
          parts.push(['', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'][o]);
        } else {
          parts.push(ones[o]);
        }
      }
    }
    return parts.join(' ');
  }

  const parts: string[] = [];
  const thousands = Math.floor(n / 1000);
  const remainder = n % 1000;

  if (thousands) {
    const t = threeDigits(thousands, true);
    const lastTwo = thousands % 100;
    const lastOne = thousands % 10;
    let suffix = 'тысяч';
    if (lastTwo < 11 || lastTwo > 19) {
      if (lastOne === 1) suffix = 'тысяча';
      else if (lastOne >= 2 && lastOne <= 4) suffix = 'тысячи';
    }
    parts.push(t + ' ' + suffix);
  }
  if (remainder) {
    parts.push(threeDigits(remainder, false));
  }

  return parts.join(' ');
}
