'use strict';
/* The Owner Summary (owner, 2026-09-29): "a maximum two to three pages summary
   for short briefs for owners with visuals ... monthly or yearly".

   Pins what the document promises: at most three A4 pages for a month AND for a
   year; figures that are the Reports page's own (revenue, the method split and
   the owing list each reconcile to it); the page's period untouched after a
   build; archived months named rather than printed as zero; and both choices
   offered from the Reports export menu. */
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs'); const path = require('path');
const { resetProfile } = require('./_profile'); const { settleFreshInstall } = require('./_fresh-install');
const os = require('os');
const DIR = path.join(os.tmpdir(), 'hostyllo-owner-brief');

test('owner summary', async () => {
  test.setTimeout(600000);
  fs.mkdirSync(DIR, { recursive: true });
  resetProfile(); const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
  await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
  await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
  await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
  await settleFreshInstall(win);
  const out = await win.evaluate(async () => {
    DB.settings.hostelName = 'Test Boys Hostel';
    const y = Number(thisMonth().slice(0, 4)), curM = Number(thisMonth().slice(5, 7));
    const methods = ['Cash', 'Cash', 'Cash', 'JazzCash', 'Easypaisa', 'Bank Transfer'];
    const names = ['Ahmad Khan','Bilal Shah','Usman Ali','Hamza Tariq','Zain Abbas','Faizan Ahmed','Saad Iqbal','Hassan Raza','Ali Haider','Umar Farooq',
                   'Talha Nadeem','Waleed Aslam','Arslan Javed','Danish Malik','Shahzaib Noor','Imran Yousaf','Kamran Akhtar','Nabeel Saeed','Rehan Qureshi','Salman Butt',
                   'Tayyab Hussain','Junaid Akram','Fahad Mehmood','Asad Rafiq','Owais Sultan','Moiz Anwar','Haris Latif','Adeel Zafar','Sohaib Riaz','Yasir Hameed'];
    DB.students = []; DB.payments = []; DB.expenses = [];
    names.forEach((n, i) => {
      const room = DB.rooms[i % DB.rooms.length];
      const join = (i < 24 ? (y - 1) + '-11-01' : y + '-' + String(Math.max(1, curM - (i - 23))).padStart(2, '0') + '-03');
      DB.students.push({ id: 'st' + i, name: n, fatherName: 'F', roomId: room.id, rent: 12000 + (i % 4) * 2000, status: 'Active', joinDate: join, phone: '0300' + (1000000 + i) });
      room.studentIds = (room.studentIds || []).concat(['st' + i]);
    });
    for (let m = 1; m <= curM; m++) {
      const mk = y + '-' + String(m).padStart(2, '0');
      DB.students.forEach((s, i) => {
        if (s.joinDate.slice(0, 7) > mk) return;
        const rent = s.rent + (i % 3 === 0 ? 6500 : 0);
        let paid = rent, st = 'Paid';
        if (m === curM && i % 5 === 0) { paid = 0; st = 'Pending'; }
        else if (m === curM && i % 7 === 0) { paid = Math.round(rent / 2); st = 'Pending'; }
        else if (m === curM - 1 && i % 9 === 0) { paid = rent - 4000; st = 'Pending'; }
        const room = DB.rooms.find(r => r.id === s.roomId);
        DB.payments.push({ id: 'p' + m + '_' + i, studentId: s.id, studentName: s.name, roomId: s.roomId, roomNumber: String(room.number),
          month: mk, monthlyRent: rent, amount: paid, unpaid: rent - paid, admissionFee: (s.joinDate.slice(0, 7) === mk ? 5000 : 0),
          extraCharges: (i % 6 === 0 ? [{ description: 'Cooler', amount: 1500 }] : []), method: methods[i % methods.length],
          date: mk + '-0' + (1 + (i % 8)), status: st });
      });
      [['Electricity', 85000 + m * 3000], ['Staff Salary', 120000], ['Groceries', 160000 + m * 2500], ['Gas', 22000], ['Internet', 6000],
       ['Repairs', m % 3 ? 9000 : 42000], ['Water', 4000], ['Cleaning', 7000], ['Stationery', 1800]]
        .forEach(([cat, amt], j) => DB.expenses.push({ id: 'e' + m + '_' + j, date: mk + '-1' + (j % 9), category: cat, amount: amt, description: cat + ' bill', method: 'Cash' }));
    }
    const cats = ['Electricity','Staff Salary','Groceries','Gas','Internet','Repairs','Water','Cleaning','Stationery'];
    DB.settings.expenseCategories = (DB.settings.expenseCategories || []).concat(cats.filter(c => !(DB.settings.expenseCategories || []).includes(c)));
    await saveDB();
    const before = [reportMonth, reportYearly];
    const res = { before };
    for (const [k, yr] of [[thisMonth(), false], [String(y), true]]) {
      const d = ownerBriefData(k, yr);
      res[yr ? 'year' : 'month'] = {
        html: ownerBriefHTML(d), label: d.label, pending: d.cur.pending,
        owedSum: d.owing.reduce((s, o) => s + o.amt, 0), rev: d.cur.rev,
        pageRev: _rptTotals([k]).rev, methodSum: d.methods.reduce((s, m) => s + m.amt, 0),
        after: [reportMonth, reportYearly],
      };
    }
    return res;
  });
  const report = { before: out.before };
  for (const tag of ['month', 'year']) {
    const r = out[tag];
    const f = path.join(DIR, tag + '.html'); fs.writeFileSync(f, r.html);
    const info = await app.evaluate(async ({ BrowserWindow }, [file, dir, tag]) => {
      const fsx = process.mainModule.require('fs'); const px = process.mainModule.require('path');
      const w = new BrowserWindow({ show: false, width: 794, height: 1123 });
      await w.loadFile(file);
      const pdf = await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true,
        margins: { marginType: 'custom', top: 0.47, bottom: 0.47, left: 0.47, right: 0.47 } });
      fsx.writeFileSync(px.join(dir, tag + '.pdf'), pdf);
      const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
      w.destroy();
      return { pages };
    }, [f, DIR, tag]);
    report[tag] = { label: r.label, pdfPages: info.pages, html: r.html, pending: r.pending, owedSum: r.owedSum,
                    rev: r.rev, pageRev: r.pageRev, methodSum: r.methodSum, after: r.after };
  }
  for (const tag of ['month', 'year']) {
    const r = report[tag];
    expect(r.pdfPages, tag + ': three A4 pages at most').toBeLessThanOrEqual(3);
    expect(r.pdfPages, tag + ': all three sections printed').toBeGreaterThanOrEqual(3);
    expect(r.rev, tag + ': revenue is the Reports page figure').toBe(r.pageRev);
    expect(r.methodSum, tag + ': the method split adds up to revenue').toBe(r.rev);
    expect(r.owedSum, tag + ': the owing list adds up to Pending').toBe(r.pending);
    expect(r.after, tag + ': the page keeps its own period').toEqual(report.before);
  }
  // Jan and Feb were archived by the retention sweep: named, not shown as zero.
  expect(report.year.html).toContain('in archive');
  expect(report.year.html).toContain('moved to the Annual Archive');
  expect(report.month.html).not.toContain('moved to the Annual Archive');

  // Both choices sit in the Reports export menu, each naming its period.
  await win.evaluate(() => navigate('reports'));
  await win.waitForSelector('#rpt-ob-month', { state: 'attached', timeout: 10000 });
  const menu = await win.evaluate(() => ({
    month: document.getElementById('rpt-ob-month').textContent.replace(/\s+/g, ' ').trim(),
    year:  document.getElementById('rpt-ob-year').textContent.replace(/\s+/g, ' ').trim(),
  }));
  expect(menu.month).toContain('Monthly');
  expect(menu.month).toContain(await win.evaluate(() => monthLabel(thisMonth())));
  expect(menu.year).toContain('Yearly');
  expect(menu.year).toContain(await win.evaluate(() => thisMonth().slice(0, 4)));
  await app.close();
});
