// ════════════════════════════════════════════════════════════════════════════
// One press, one save — every money form (bug audit 2026-09-28, BUG-002..007).
//
// Each submit is called twice without awaiting the first, which is exactly what
// a double-click does: the button stayed enabled while the first call was
// inside `await saveDB()`, and the second call posted the money again. Before
// the fix every assertion below failed — two expenses, two owner-fund
// movements, a reversal taken back twice, a receipt recorded twice, a second
// month record. The guard is submitOnce() in utils.js.
// ════════════════════════════════════════════════════════════════════════════
'use strict';

const { test, expect, _electron: electron } = require('@playwright/test');
const path = require('path');
const { resetProfile } = require('./_profile');
const { settleFreshInstall } = require('./_fresh-install');

test.beforeAll(() => { resetProfile(); });

test('a double press posts the money once, on every money form', async () => {
  test.setTimeout(180000);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(e.message));
  try {
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
    await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
    await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
    await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
    await settleFreshInstall(win);
    await win.waitForFunction(() => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });

    const r = await win.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const R = {};
      if (DB.settings.security) DB.settings.security.pinOn = false;
      const rt = DB.settings.roomTypes.find(x => x.id === '2s'); rt.defaultRent = 10000; rt.defaultMess = 0;
      DB.rooms = [{ id: 'rmD', number: 'D1', floor: 'Ground', typeId: '2s', studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuD', name: 'Double Click', fatherName: 'G', phone: '0300-1112299', roomId: 'rmD', status: 'Active', messOptIn: false, joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.expenses = []; DB.ownerFunds = [];
      const freshMonth = async () => { DB.payments = []; await saveDB(); await generateMonthlyRents(); return DB.payments.find(x => x.studentId === 'stuD'); };

      // Add Payment: two presses before the "already exists" question is answered.
      await freshMonth();
      openAddPayment('stuD'); await wait(1100);
      const inp = document.getElementById('f-ppaid'); inp.value = '4000'; inp.dispatchEvent(new Event('input'));
      await Promise.all([submitAddPayment(), submitAddPayment()]); await wait(400);
      R.addPaymentRecords = DB.payments.filter(x => x.studentId === 'stuD').length;
      closeModal();

      // Reverse a collection.
      let p = await freshMonth();
      applyPayment(p, { amount: 10000, method: 'Cash' }); await saveDB();
      showReversePaymentModal(p.id); await wait(300);
      document.getElementById('f-prev-amt').value = '1000';
      document.getElementById('f-prev-reason').value = 'double press';
      await Promise.all([submitReversePayment(p.id), submitReversePayment(p.id)]);
      R.reverse = { collected: p.amount, reversals: (p.reversals || []).length };

      // Edit Payment → Receive pending.
      p = await freshMonth();
      applyPayment(p, { amount: 4000, method: 'Cash' }); await saveDB();
      navigate('payments'); await wait(400);
      showEditPaymentModal(p.id); await wait(500);
      document.getElementById('f-precv').value = '2000';
      const reason = document.getElementById('f-pedit-reason'); if (reason) reason.value = 'double press';
      await Promise.all([submitEditPayment(p.id), submitEditPayment(p.id)]); await wait(300);
      R.editReceive = { collected: p.amount, instalments: (p.partialPayments || []).map(i => i.amount) };
      closeModal();

      // Expense.
      navigate('expenses'); await wait(400);
      showAddExpenseModal();
      document.getElementById('f-ecat').value = 'Electricity';
      document.getElementById('f-eamt').value = '4500';
      document.getElementById('f-edate').value = thisMonth() + '-09';
      document.getElementById('f-ewho').value = 'PESCO';
      document.getElementById('f-edesc').value = 'Bill';
      await Promise.all([submitExpense(), submitExpense()]);
      R.expenses = DB.expenses.length;

      // Owner fund.
      localStorage.setItem('hx_feat_on_ownerFunds', '1');
      showOwnerFundModal(); document.getElementById('of-amt').value = '10000';
      await Promise.all([submitOwnerFund(), submitOwnerFund()]);
      R.ownerFunds = DB.ownerFunds.length;
      localStorage.removeItem('hx_feat_on_ownerFunds');

      // After all that, a normal second expense still saves (the guard frees itself).
      showAddExpenseModal();
      document.getElementById('f-ecat').value = 'Water';
      document.getElementById('f-eamt').value = '800';
      document.getElementById('f-edate').value = thisMonth() + '-10';
      document.getElementById('f-ewho').value = 'Tanker';
      document.getElementById('f-edesc').value = 'Water';
      await submitExpense();
      R.expensesAfterSecondSave = DB.expenses.length;
      return R;
    });

    expect(r.addPaymentRecords, 'a double press made a second month record').toBe(1);
    expect(r.reverse).toEqual({ collected: 9000, reversals: 1 });
    expect(r.editReceive).toEqual({ collected: 6000, instalments: [4000, 2000] });
    expect(r.expenses).toBe(1);
    expect(r.ownerFunds).toBe(1);
    expect(r.expensesAfterSecondSave).toBe(2);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

/* BUG-001 (fix 2): closing a question with × is answering it "No".
   The Add Payment page's "pending record already exists" question set a global
   flag that only its Cancel button cleared; × left it set, and the next
   ordinary click created a DUPLICATE month record without asking. The
   student-page form's "already paid — charge twice?" question had the same
   flag, and after × the next save charged the paid month again. */
test('closing a payment question with × is a No — the next press asks again', async () => {
  test.setTimeout(180000);
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'),
    args: [path.join(__dirname, '..'), '--dev', '--user-data-dir=' + process.env.HOSTIX_TEST_PROFILE, '--no-sandbox', '--disable-gpu'], env });
  const win = await app.firstWindow();
  const errors = []; win.on('pageerror', e => errors.push(e.message));
  try {
    await win.waitForSelector('#login-input', { state: 'visible', timeout: 60000 });
    await win.waitForFunction(() => typeof WARDENS !== 'undefined' && WARDENS.warden1 && WARDENS.warden1.pw, null, { timeout: 60000 });
    await win.selectOption('#login-user', 'warden1'); await win.fill('#login-input', 'admin123'); await win.click('#login-btn');
    await win.waitForFunction(() => { const s = document.getElementById('login-screen'); return s && s.style.display === 'none'; }, null, { timeout: 60000 });
    await win.waitForFunction(() => typeof _ledgerReady !== 'undefined' && _ledgerReady === true, null, { timeout: 30000 });

    const r = await win.evaluate(async () => {
      const wait = ms => new Promise(res => setTimeout(res, ms));
      const asked = re => re.test((document.getElementById('modal-container') || {}).textContent || '');
      const R = {};
      if (DB.settings.security) DB.settings.security.pinOn = false;
      const rt = DB.settings.roomTypes.find(x => x.id === '2s'); rt.defaultRent = 10000; rt.defaultMess = 0;
      DB.rooms = [{ id: 'rmX', number: 'X1', floor: 'Ground', typeId: '2s', studentIds: [], amenities: [], notes: '', rent: 10000 }];
      DB.students = [{ id: 'stuX', name: 'Cross Close', fatherName: 'G', phone: '0300-1112288', roomId: 'rmX', status: 'Active', messOptIn: false, joinDate: '2026-01-01', paymentMethod: 'Cash' }];
      DB.payments = []; await saveDB(); await generateMonthlyRents();
      const recs = () => DB.payments.filter(x => x.studentId === 'stuX');

      // ── Add Payment page ──
      const press = async () => { openAddPayment('stuX'); await wait(1100);
        const i = document.getElementById('f-ppaid'); i.value = '4000'; i.dispatchEvent(new Event('input'));
        await submitAddPayment(); await wait(300); };
      await press();
      R.firstAsked = asked(/Pending Record Already Exists/);
      closeModal();                                     // what × / Escape do
      await press();
      R.askedAgain = asked(/Pending Record Already Exists/);
      R.recordsBeforeOk = recs().length;
      _confirmYes(); await wait(700);                   // now answer OK
      R.afterOk = recs().map(p => ({ amount: p.amount, unpaid: p.unpaid }));

      // ── Student-page form: "already paid — charge again?" ──
      const p = recs()[0];
      applyPayment(p, { amount: money(p.unpaid), method: 'Cash' }); await saveDB();
      const paidCount = () => recs().filter(x => x.status === 'Paid').length;
      const pressPS = async () => { closeModal(); showAddPaymentForStudent('stuX'); await wait(400);
        const i = document.getElementById('f-ps-paid'); if (i) { i.value = '5000'; i.dispatchEvent(new Event('input')); }
        await submitPaymentForStudent(); await wait(300); };
      await pressPS();
      R.psFirstAsked = asked(/Already Paid/);
      closeModal();                                     // × on "already paid"
      await pressPS();
      R.psAskedAgain = asked(/Already Paid/);
      R.psPaidRecordsAfterX = paidCount();
      closeModal();
      return R;
    });

    expect(r.firstAsked).toBe(true);
    expect(r.askedAgain, 'after × the next press must ask again, not create a record').toBe(true);
    expect(r.recordsBeforeOk).toBe(1);
    expect(r.afterOk).toEqual([{ amount: 4000, unpaid: 6000 }]);
    expect(r.psFirstAsked).toBe(true);
    expect(r.psAskedAgain, 'after × on "already paid" the next save must ask again').toBe(true);
    expect(r.psPaidRecordsAfterX, 'the paid month was charged again without asking').toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await app.close();
  }
});

