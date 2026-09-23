// Generates a print-ready HTML акт выполненных работ.

export interface ActService {
  description: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export interface ActData {
  actNumber: string;
  date: string;       // DD.MM.YYYY (дата подписания = последний день месяца)
  periodFrom: string; // DD.MM.YYYY
  periodTo: string;   // DD.MM.YYYY
  payerEmail: string;
  payerName?: string;
  services: ActService[];
  totalAmount: number;
}

const COMPANY = {
  name: 'Частное производственное унитарное предприятие «Первая Компания»',
  short: 'ЧП «Первая Компания»',
  address: '247710, Гомельская область, г. Калинковичи, ул. Геологов, 3',
  unp: '490556542',
  phones: '+375-29-6945071, +375-29-6035582',
  email: '6035582@gmail.com',
};

function fmt(n: number) {
  return n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

export function renderActHtml(data: ActData): string {
  const rows = data.services.map((s, i) => `
    <tr>
      <td class="num">${i + 1}</td>
      <td>${s.description}</td>
      <td class="num">${s.quantity}</td>
      <td class="num">${s.unit}</td>
      <td class="right">${fmt(s.price)}</td>
      <td class="right">${fmt(s.total)}</td>
    </tr>`).join('');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<title>Акт выполненных работ ${data.actNumber}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 12pt; color: #000; background: #fff; }
  .page { max-width: 210mm; margin: 10mm auto; padding: 15mm 20mm; }
  h2 { font-size: 15pt; text-align: center; margin-bottom: 4px; }
  .subtitle { text-align: center; font-size: 11pt; margin-bottom: 20px; color: #333; }
  .parties { display: flex; gap: 20px; margin-bottom: 18px; font-size: 11pt; }
  .party { flex: 1; border: 1px solid #ccc; padding: 10px; }
  .party-title { font-weight: bold; margin-bottom: 6px; font-size: 11pt; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
  .party-row { margin-bottom: 4px; }
  table { width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 11pt; }
  th { background: #f0f0f0; border: 1px solid #999; padding: 6px 8px; text-align: center; font-weight: bold; }
  td { border: 1px solid #999; padding: 6px 8px; }
  td.num { text-align: center; }
  td.right { text-align: right; }
  .total-row td { font-weight: bold; background: #fafafa; }
  .note { font-size: 10pt; color: #555; margin-top: 8px; }
  .sign-section { margin-top: 30px; }
  .sign-grid { display: flex; gap: 40px; margin-top: 16px; }
  .sign-col { flex: 1; }
  .sign-title { font-weight: bold; margin-bottom: 10px; }
  .sign-line { display: flex; gap: 10px; margin-bottom: 10px; font-size: 11pt; }
  .sign-label { min-width: 110px; }
  .sign-value { border-bottom: 1px solid #000; flex: 1; min-height: 18px; }
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

  <h2>АКТ ВЫПОЛНЕННЫХ РАБОТ (ОКАЗАННЫХ УСЛУГ) № ${data.actNumber}</h2>
  <div class="subtitle">от ${data.date}</div>
  <div class="subtitle" style="font-size:10pt;">Период: ${data.periodFrom} — ${data.periodTo}</div>

  <div class="parties">
    <div class="party">
      <div class="party-title">Исполнитель</div>
      <div class="party-row"><b>${COMPANY.name}</b></div>
      <div class="party-row">УНП: ${COMPANY.unp}</div>
      <div class="party-row">${COMPANY.address}</div>
      <div class="party-row">Тел: ${COMPANY.phones}</div>
      <div class="party-row">Email: ${COMPANY.email}</div>
    </div>
    <div class="party">
      <div class="party-title">Заказчик</div>
      <div class="party-row"><b>${data.payerName || data.payerEmail}</b></div>
      <div class="party-row">Email: ${data.payerEmail}</div>
    </div>
  </div>

  <p style="font-size:11pt;margin-bottom:8px;">
    Исполнитель оказал, а Заказчик принял следующие услуги:
  </p>

  <table>
    <thead>
      <tr>
        <th style="width:40px">№</th>
        <th>Наименование услуги</th>
        <th style="width:70px">Кол-во</th>
        <th style="width:60px">Ед.</th>
        <th style="width:110px">Цена, BYN</th>
        <th style="width:110px">Сумма, BYN</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="4"></td>
        <td style="text-align:right;border:1px solid #999;padding:6px 8px;font-weight:bold;">Итого:</td>
        <td class="right" style="border:1px solid #999;padding:6px 8px;font-weight:bold;">${fmt(data.totalAmount)} BYN</td>
      </tr>
    </tfoot>
  </table>

  <p class="note">НДС не облагается (упрощённая система налогообложения).</p>
  <p style="font-size:11pt;font-weight:bold;margin-top:10px;">
    Итого оказано услуг на сумму: ${fmt(data.totalAmount)} BYN.
  </p>
  <p style="font-size:11pt;margin-top:8px;">
    Вышеперечисленные услуги выполнены полностью и в срок. Заказчик претензий по объёму, качеству и срокам оказания услуг не имеет.
  </p>

  <div class="sign-section">
    <div class="sign-grid">
      <div class="sign-col">
        <div class="sign-title">ИСПОЛНИТЕЛЬ</div>
        <div class="sign-line"><span class="sign-label">Руководитель</span><span class="sign-value"></span></div>
        <div class="sign-line"><span class="sign-label">М.П.</span><span class="sign-value"></span></div>
        <div style="font-size:10pt;color:#777;">подпись / дата</div>
      </div>
      <div class="sign-col">
        <div class="sign-title">ЗАКАЗЧИК</div>
        <div class="sign-line"><span class="sign-label">ФИО</span><span class="sign-value"></span></div>
        <div class="sign-line"><span class="sign-label">Дата</span><span class="sign-value"></span></div>
        <div style="font-size:10pt;color:#777;">подпись / дата</div>
      </div>
    </div>
  </div>

</div>
</body>
</html>`;
}
