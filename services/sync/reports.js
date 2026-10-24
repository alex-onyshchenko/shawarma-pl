import PDFDocument from 'pdfkit';
import { fileURLToPath } from 'node:url';

const DAY = 86400000;
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };
const money = kopecks => new Intl.NumberFormat('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(kopecks / 100);
export const reportDate = (timestamp, timeZone) => new Intl.DateTimeFormat('uk-UA', {
  timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(timestamp);

// Money is calculated in kopecks. Commission rounds per sale, so the rows and totals agree.
export function salesReport(orders, point, { period = '7', commission = '0', now = Date.now() } = {}) {
  if (!['7', '21', '30'].includes(String(period))) invalid('Оберіть період: 7, 21 або 30 днів');
  const rate = String(commission);
  if (!/^(?:\d{1,3})(?:\.\d{1,2})?$/.test(rate) || Number(rate) > 100) invalid('Комісія має бути від 0 до 100%, до двох знаків після крапки');
  const rateBps = Math.round(Number(rate) * 100);
  const from = now - Number(period) * DAY;
  const sales = orders.filter(order => order.status === 'archived' && (!order.pointId || order.pointId === point.id))
    .map(order => ({ order, soldAt: order.issuedAt || order.createdAt, estimatedDate: !order.issuedAt }))
    .filter(({ soldAt }) => Number.isFinite(soldAt) && soldAt >= from && soldAt <= now)
    .sort((a, b) => a.soldAt - b.soldAt || String(a.order.id).localeCompare(String(b.order.id)))
    .map(({ order, soldAt, estimatedDate }) => {
      const amountKopecks = Math.round(Number(order.totalPrice || 0) * 100);
      const commissionKopecks = Math.round(amountKopecks * rateBps / 10000);
      return { id: String(order.id), soldAt, estimatedDate,
        items: (order.items || []).map(item => ({ name: item.name, qty: item.qty, unitPrice: item.unitPrice })),
        amountKopecks, commissionKopecks, netKopecks: amountKopecks - commissionKopecks };
    });
  const totals = sales.reduce((sum, sale) => ({
    amountKopecks: sum.amountKopecks + sale.amountKopecks,
    commissionKopecks: sum.commissionKopecks + sale.commissionKopecks,
    netKopecks: sum.netKopecks + sale.netKopecks,
  }), { amountKopecks: 0, commissionKopecks: 0, netKopecks: 0 });
  return { point: { id: point.id, name: point.name, address: point.address }, timeZone: point.timeZone,
    period: Number(period), from, to: now, generatedAt: now, commissionRate: rateBps / 100,
    count: sales.length, estimatedDates: sales.some(sale => sale.estimatedDate), totals, sales };
}

export function reportPdf(report) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true, autoFirstPage: false,
      info: { Title: 'ШаурМіша - Звіт про продажі', Author: report.point.name } });
    const chunks = [];
    doc.on('data', chunk => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    try {
      doc.registerFont('regular', fileURLToPath(new URL('./fonts/NotoSans-Regular.ttf', import.meta.url)));
      doc.registerFont('bold', fileURLToPath(new URL('./fonts/NotoSans-Bold.ttf', import.meta.url)));
      const left = 40, right = 555, bottom = 758;
      const columns = [40, 91, 179, 410, 484];
      let y;
      const text = (value, x, atY, width, { bold = false, size = 9, color = '#27272a', align = 'left' } = {}) => {
        doc.font(bold ? 'bold' : 'regular').fontSize(size).fillColor(color).text(String(value), x, atY, { width, align, lineBreak: false });
      };
      const tableHeader = () => {
        doc.rect(left, y, right - left, 25).fill('#f4f4f5');
        ['Чек', 'Дата / час', 'Позиції', 'Продаж, грн', 'Комісія, грн'].forEach((label, index) => text(label, columns[index] + 5, y + 8, index === 2 ? 220 : index === 1 ? 80 : index > 2 ? 63 : 44, { bold: true, size: 8, align: index > 2 ? 'right' : 'left' }));
        y += 31;
      };
      const newPage = (first = false) => {
        doc.addPage();
        text(report.point.name, left, 38, 515, { bold: true, size: first ? 22 : 15 });
        text('Звіт про продажі', left, first ? 71 : 63, 515, { size: first ? 14 : 10, color: '#71717a' });
        text(`${reportDate(report.from, report.timeZone)} - ${reportDate(report.to, report.timeZone)}`, left, first ? 97 : 83, 515, { size: 9 });
        y = first ? 125 : 108;
        if (first) {
          const addressHeight = doc.font('regular').fontSize(9).heightOfString(report.point.address, { width: 515 });
          doc.text(report.point.address, left, y, { width: 515 }); y += addressHeight + 10;
          text(`Часовий пояс: ${report.timeZone}. Сформовано: ${reportDate(report.generatedAt, report.timeZone)}`, left, y, 515, { size: 8, color: '#71717a' }); y += 25;
          const metrics = [['Продажів', String(report.count)], ['Сума продажів', money(report.totals.amountKopecks) + ' грн'], [`Комісія ${report.commissionRate}%`, money(report.totals.commissionKopecks) + ' грн'], ['Після комісії', money(report.totals.netKopecks) + ' грн']];
          metrics.forEach(([label, value], index) => {
            const x = left + index * 130;
            text(label, x, y, 125, { size: 8, color: '#71717a' });
            text(value, x, y + 16, 125, { bold: true, size: 11 });
          });
          y += 60;
          text('Лише видані замовлення. Скасовані й незавершені не включені.', left, y, 515, { size: 8, color: '#71717a' }); y += 18;
          if (report.estimatedDates) {
            doc.font('regular').fontSize(8).fillColor('#71717a').text('* Старі чеки без часу видачі враховано за часом створення замовлення.', left, y, { width: 515 });
            y += 26;
          }
        }
        tableHeader();
      };
      const wrap = (value, width) => {
        doc.font('regular').fontSize(8.5);
        const lines = []; let line = '';
        for (const word of String(value).split(/\s+/)) {
          if (line && doc.widthOfString(line + ' ' + word) > width) { lines.push(line); line = ''; }
          for (const char of word) {
            if (doc.widthOfString(line + char) > width) { lines.push(line); line = ''; }
            line += char;
          }
          line += ' ';
        }
        if (line.trim()) lines.push(line.trim());
        return lines.length ? lines : ['-'];
      };
      newPage(true);
      if (!report.sales.length) { text('За обраний період виданих замовлень немає.', left + 5, y + 14, 505, { color: '#71717a' }); y += 50; }
      for (const sale of report.sales) {
        const lines = sale.items.flatMap(item => wrap(`${item.qty} × ${item.name}`, 220));
        if (!lines.length) lines.push('-');
        let offset = 0;
        while (offset < lines.length) {
          if (bottom - y < 47) newPage();
          const count = Math.min(lines.length - offset, Math.floor((bottom - y - 16) / 13));
          text(`#${sale.id}${offset ? ' +' : ''}`, columns[0] + 5, y + 5, 44, { size: 8 });
          const [date, time] = reportDate(sale.soldAt, report.timeZone).split(', ');
          text(date + (sale.estimatedDate ? '*' : ''), columns[1] + 5, y + 5, 80, { size: 8 });
          text(time, columns[1] + 5, y + 18, 80, { size: 8, color: '#71717a' });
          lines.slice(offset, offset + count).forEach((line, index) => text(line, columns[2] + 5, y + 5 + index * 13, 220, { size: 8.5 }));
          if (offset === 0) {
            text(money(sale.amountKopecks), columns[3] + 5, y + 5, 63, { size: 8.5, align: 'right' });
            text(money(sale.commissionKopecks), columns[4] + 5, y + 5, 63, { size: 8.5, align: 'right' });
          }
          y += Math.max(40, count * 13 + 16);
          doc.moveTo(left, y - 5).lineTo(right, y - 5).lineWidth(0.5).strokeColor('#e4e4e7').stroke();
          offset += count;
        }
      }
      if (bottom - y < 100) newPage();
      y += 15;
      text(`Разом. Продажів: ${report.count}`, left, y, 300, { bold: true, size: 11 });
      text(money(report.totals.amountKopecks) + ' грн', left, y + 23, 515, { bold: true, size: 11 });
      text(`Комісія ${report.commissionRate}%: ${money(report.totals.commissionKopecks)} грн. Після комісії: ${money(report.totals.netKopecks)} грн.`, left, y + 47, 515, { size: 9 });
      const range = doc.bufferedPageRange();
      for (let index = range.start; index < range.start + range.count; index++) {
        doc.switchToPage(index); doc.page.margins.bottom = 0;
        text(`ШаурМіша - ${index + 1} / ${range.count}`, left, doc.page.height - 28, 515, { size: 8, color: '#a1a1aa', align: 'right' });
      }
      doc.end();
    } catch (error) { doc.destroy(); reject(error); }
  });
}
