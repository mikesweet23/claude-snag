// End-to-end smoke test: node tests/e2e.mjs  (needs Playwright + a local server on :8080)
//   python3 -m http.server 8080 &  then  node tests/e2e.mjs
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
const require = createRequire(import.meta.url);
let pw;
try { pw = require('playwright'); } catch { pw = require(execSync('npm root -g').toString().trim() + '/playwright'); }

const BASE = process.env.BASE_URL || 'http://localhost:8080/';
const OUT = process.env.OUT_DIR || 'test-output';
fs.mkdirSync(OUT, { recursive: true });

const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, acceptDownloads: true, locale: 'en-GB' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('dialog', d => d.accept(d.type() === 'prompt' ? 'Site Manager' : undefined));

// Make test photos (landscape + portrait) with a canvas.
async function makePhoto(w, h, label) {
  const b64 = await page.evaluate(([w, h, label]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#94a3b8'); g.addColorStop(1, '#475569');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff'; x.font = `bold ${w / 10}px sans-serif`; x.fillText(label, w * 0.1, h * 0.5);
    return c.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, [w, h, label]);
  const f = `${OUT}/${label}.jpg`; fs.writeFileSync(f, Buffer.from(b64, 'base64')); return f;
}

await page.goto(BASE);
const photos = [await makePhoto(2000, 1500, 'Photo1'), await makePhoto(1500, 2000, 'Photo2'), await makePhoto(2000, 1500, 'Photo3')];

await page.click('#newSurvey');
await page.fill('#f-site', 'Plot 12, Riverside Court');
await page.fill('#f-address', '1 River Lane, Leeds');
const surveyors = await page.$$eval('#f-surveyor option', o => o.map(x => x.textContent));
if (!surveyors.includes('Stuart Clements')) throw new Error('Surveyor list missing defaults: ' + surveyors);
await page.selectOption('#f-surveyor', 'Mike Slattery');
await page.fill('#f-client', 'ACME Homes / J1234');
await page.fill('#f-notes', 'Pre-handover snagging walk-round.');
await page.screenshot({ path: `${OUT}/1-survey.png` });

// Add one photo -> item editor opens
let [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#addPhoto')]);
await chooser.setFiles(photos[0]);
await page.waitForSelector('#comment');
await page.fill('#loc', 'Kitchen');
await page.fill('#comment', 'Cracked tile behind sink. Replace tile and re-grout; check sealant around worktop is continuous.');
await page.click('#disc button[data-p="HVAC"]');
await page.click('#people button[data-p="Plumber"]');
await page.click('#dueQuick button[data-d="7"]');
await page.click('#prio button[data-v="High"]');

// Mark-up: arrow + box + text
await page.click('#markup');
await page.waitForSelector('.markup canvas');
const box = await page.locator('.markup canvas').boundingBox();
const drag = async (x1, y1, x2, y2) => {
  await page.mouse.move(box.x + box.width * x1, box.y + box.height * y1); await page.mouse.down();
  await page.mouse.move(box.x + box.width * x2, box.y + box.height * y2, { steps: 8 }); await page.mouse.up();
};
await drag(0.15, 0.2, 0.45, 0.45);
await page.click('.markup [data-t="rect"]');
await page.click('.markup [data-c="#facc15"]');
await drag(0.5, 0.5, 0.85, 0.8);
await page.click('.markup [data-t="text"]');
await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.15);
await page.screenshot({ path: `${OUT}/2-markup.png` });
await page.click('.markup [data-a="done"]');
await page.waitForSelector('.markup', { state: 'detached' });
await page.screenshot({ path: `${OUT}/3-item.png`, fullPage: true });

// Add two more at once from the item screen ("Add another" supports multi-select)
[chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#nextBtn')]);
await chooser.setFiles([photos[1], photos[2]]);
await page.waitForSelector('.item-card');
await page.click('.item-card >> nth=1');
await page.waitForSelector('#comment');
await page.fill('#loc', 'Bedroom 2');
await page.fill('#comment', 'Door catches on frame when closing. Plane door edge and re-hang. '.repeat(6));
await page.click('#disc button[data-p="Pipework"]');
await page.click('#people button[data-p="Joiner"]');
await page.click('#dueQuick button[data-d="0"]');
await page.click('#doneBtn');
await page.waitForSelector('.item-card');
await page.click('.item-card >> nth=2');
await page.waitForSelector('#comment');
await page.fill('#comment', 'Paint touch-up on skirting.');
await page.click('#people [data-add]'); // prompt -> "Site Manager"
await page.click('#status button[data-v="Complete"]');
await page.click('#doneBtn');
await page.waitForSelector('.item-card');
await page.screenshot({ path: `${OUT}/4-list.png`, fullPage: true });

// Export PDF
await page.click('#makePdf');
const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#x-dl')]);
const pdfPath = `${OUT}/${dl.suggestedFilename()}`;
await dl.saveAs(pdfPath);
const pdf = fs.readFileSync(pdfPath);
console.log('PDF:', pdfPath, pdf.length, 'bytes', 'pages:', (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length);

// Persistence: reload and check data survives
await page.goto(BASE);
await page.waitForSelector('.survey-card');
const home = await page.textContent('.survey-card');
console.log('Home card:', home.replace(/\s+/g, ' ').trim());
await page.screenshot({ path: `${OUT}/5-home.png` });
await page.click('#installBtn');
await page.waitForSelector('.install-steps');
await page.screenshot({ path: `${OUT}/6-install-help.png` });
await page.click('#ih-ok');
await page.goto(BASE + '#/settings');
await page.waitForSelector('#s-storage strong');
if (await page.inputValue('#s-company') !== 'adi Climate Systems Limited') throw new Error('Company default not set');
await page.screenshot({ path: `${OUT}/7-settings.png`, fullPage: true });

if (errors.length) { console.error('Page errors:', errors); process.exitCode = 1; }
await browser.close();
