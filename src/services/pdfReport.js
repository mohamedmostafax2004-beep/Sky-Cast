const PDFDocument = require('pdfkit');

function formatYmd(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return yyyymmdd;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

function isValid(x) {
  return x != null && x !== -999 && !Number.isNaN(Number(x));
}

function formatMetric(v, decimals = 1) {
  if (!isValid(v)) return '—';
  return Number(v).toFixed(decimals);
}

function avg(values) {
  const v = values.filter(isValid);
  if (!v.length) return '—';
  return (v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
}

function sum(values) {
  const v = values.filter(isValid);
  if (!v.length) return '—';
  return v.reduce((a, b) => a + b, 0).toFixed(1);
}

function buildWeatherPdf(weatherData, meta = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#472dbb').text('SkyCast Weather Report', { align: 'center' });
    doc.moveDown(0.5);
    doc.fontSize(11).fillColor('#333');
    doc.text(`Location: ${meta.placeName || `${weatherData.lat}, ${weatherData.lon}`}`);
    doc.text(`Period: ${formatYmd(weatherData.userStart)} → ${formatYmd(weatherData.userEnd)}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);
    doc.moveDown();

    const dates = weatherData.dates || [];
    const temps = dates.map((d) => weatherData.temps[d]);
    const precs = dates.map((d) => weatherData.precs[d]);
    const winds = dates.map((d) => weatherData.wspeed[d]);

    doc.fontSize(14).fillColor('#472dbb').text('Summary');
    doc.fontSize(11).fillColor('#333');
    doc.text(`Average temperature: ${avg(temps)} °C`);
    doc.text(`Total precipitation: ${sum(precs)} mm`);
    doc.text(`Average wind speed: ${avg(winds)} m/s`);
    doc.moveDown();

    doc.fontSize(14).fillColor('#472dbb').text('Daily data');
    doc.fontSize(9).fillColor('#333');
    doc.text('Date          Temp(°C)  Rain(mm)  Wind(m/s)', { underline: true });
    dates.forEach((d) => {
      const t = weatherData.temps[d];
      const p = weatherData.precs[d];
      const w = weatherData.wspeed[d];
      doc.text(
        `${formatYmd(d)}    ${formatMetric(t, 1).padStart(6)}  ${formatMetric(p, 1).padStart(8)}  ${formatMetric(w, 1).padStart(8)}`
      );
    });

    doc.moveDown();
    doc.fontSize(8).fillColor('#666').text('Data source: NASA POWER API · SkyCast Dashboard', { align: 'center' });
    doc.end();
  });
}

function buildComparePdf(locationsData, start, end) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(22).fillColor('#472dbb').text('SkyCast Location Comparison', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).text(`Period: ${formatYmd(start)} → ${formatYmd(end)}`);

    locationsData.forEach((loc, i) => {
      doc.moveDown();
      doc.fontSize(14).fillColor('#472dbb').text(`Location ${i + 1}: ${loc.label || loc.lat + ', ' + loc.lon}`);
      const dates = loc.dates || [];
      const temps = dates.map((d) => loc.temps[d]);
      const precs = dates.map((d) => loc.precs[d]);
      doc.fontSize(11).fillColor('#333');
      doc.text(`Avg temp: ${avg(temps)} °C · Total rain: ${sum(precs)} mm`);
    });

    doc.end();
  });
}

module.exports = { buildWeatherPdf, buildComparePdf };
