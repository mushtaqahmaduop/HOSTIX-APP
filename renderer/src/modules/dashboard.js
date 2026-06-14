/* ─── HOSTIX — DASHBOARD MODULE ────────────────────────────────────────────
   Contains: calcRevenue, _payMatchesMonth, generateRooms, renderDashboard,
             all room detail modals, month detail modals, trend chart,
             global search, navigation helpers
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ══ SINGLE SOURCE OF TRUTH FOR REVENUE ══════════════════════════════════════
// Revenue = Paid payments + partial Pending payments (where amount>0 & unpaid is explicitly set)
// This is used by dashboard, reports, CSVs, PDFs, WhatsApp/email share — everywhere.
function calcRevenue(datePrefix) {
  // Use _payMatchesMonth to handle both YYYY-MM-DD date fields AND "April 2026" month labels
  const paid    = DB.payments
    .filter(p => p.status==='Paid' && _payMatchesMonth(p, datePrefix))
    .reduce((s,p) => s + Number(p.amount||0), 0);
  const partial = DB.payments
    .filter(p => p.status==='Pending' && Number(p.amount||0)>0 && p.unpaid!=null
      && _payMatchesMonth(p, datePrefix))
    .reduce((s,p) => s + Number(p.amount||0), 0);
  return paid + partial;
}
// ════════════════════════════════════════════════════════════════════════════

// ── PAYMENT MONTH MATCHER ────────────────────────────────────────────────────
// Single source of truth for "does payment p belong to monthKey (YYYY-MM)?".
// Fixes the core data-mixing bug: p.month stores "April 2026" while thisMonth()
// returns "2026-04" — .startsWith() never matched, hiding all month-label payments.
function _payMatchesMonth(p, mk) {
  if (!mk) return false;
  // Fast path: date fields are YYYY-MM-DD
  if ((p.date||'').startsWith(mk))     return true;
  if ((p.paidDate||'').startsWith(mk)) return true;
  if ((p.dueDate||'').startsWith(mk))  return true;
  // FIX-B3: Slow path — parse ANY date/month field that is not already YYYY-MM-DD.
  // Fixes silent failure when dueDate/date/paidDate is stored as "April 2026" or
  // "Apr 2026" instead of "2026-04-xx", causing payments to vanish from reports.
  function _toYM(str) {
    if (!str || typeof str !== 'string') return null;
    if (/^\d{4}-\d{2}/.test(str)) return null; // fast-path already handled these
    try {
      var d = new Date(str.trim() + ' 1');
      if (!isNaN(d.getTime()))
        return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    } catch (e) {}
    return null;
  }
  var fields = [p.month, p.dueDate, p.date, p.paidDate];
  for (var i = 0; i < fields.length; i++) {
    if (_toYM(fields[i]) === mk) return true;
  }
  return false;
}
// ─────────────────────────────────────────────────────────────────────────────

function generateRooms(roomTypes) {
  // roomTypes can be passed explicitly (from _initDBFields) to avoid reading stale DB.settings
  const rtypes = roomTypes || (DB.settings && DB.settings.roomTypes) || [];
  const rooms = [];
  // 42 rooms numbered 1–42, distributed across 4 floors
  const floors = [
    {name:'Ground', rooms:[1,2,3,4,5,6,7,8,9,10]},
    {name:'1st',    rooms:[11,12,13,14,15,16,17,18,19,20,21]},
    {name:'2nd',    rooms:[22,23,24,25,26,27,28,29,30,31]},
    {name:'3rd',    rooms:[32,33,34,35,36,37,38,39,40,41,42]}
  ];
  const typeIds = ['1s','2s','3s','4s','5s'];
  let idx=0;
  floors.forEach(f=>{
    f.rooms.forEach(num=>{
      const typeId = typeIds[idx%5];
      const type = rtypes.find(t=>t.id===typeId);
      rooms.push({
        id:'room_'+uid(), number:num, floor:f.name, typeId,
        rent:type?.defaultRent||16000, studentIds:[], amenities:['Fan','Bed','Wardrobe'], notes:''
      });
      idx++;
    });
  });
  return rooms;

function renderDashboard() {
  // Alert system
  const overduePayments = DB.payments.filter(p=>p.status==='Pending');
  const openMaint = (DB.maintenance||[]).filter(m=>m.status==='Open').length;
  const openComp = (DB.complaints||[]).filter(c=>c.status==='Open').length;
  const totalOccupied = DB.students.filter(s=>s.status==='Active').length;
  const totalBeds = DB.rooms.reduce((sum,r)=>{const rt=getRoomType(r);return sum+(rt?rt.capacity:0);},0);
  const occRate = totalBeds>0?Math.round(totalOccupied/totalBeds*100):0;
  const alerts = [];
  if(overduePayments.length>0) alerts.push({type:'warning',icon:'💰',msg:`${overduePayments.length} pending payment${overduePayments.length>1?'s':''} — ${fmtPKR(overduePayments.reduce((s,p)=>s+Number(p.amount||0),0))} uncollected`,action:"navigate('payments')"});
  if(openMaint>0) alerts.push({type:'info',icon:'🔧',msg:`${openMaint} open maintenance request${openMaint>1?'s':''}`,action:"navigate('maintenance')"});
  if(openComp>0) alerts.push({type:'danger',icon:'💬',msg:`${openComp} unresolved complaint${openComp>1?'s':''}`,action:"navigate('complaints')"});
  if(occRate < 60) alerts.push({type:'warning',icon:'🏠',msg:`Low occupancy: ${occRate}% — ${totalBeds-totalOccupied} beds vacant`,action:"navigate('rooms')"});
  const alertColors = {warning:'var(--amber)',info:'var(--blue)',danger:'var(--red)'};
  const alertBg = {warning:'var(--amber-dim)',info:'var(--blue-dim)',danger:'var(--red-dim)'};
  const alertHtml = alerts.length>0?`<div style="display:grid;gap:8px;margin-bottom:20px">${alerts.map(a=>`
    <div onclick="${a.action}" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:${alertBg[a.type]};border:1px solid ${alertColors[a.type]}55;border-radius:10px;cursor:pointer;transition:var(--transition)" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">
      <span style="font-size:18px">${a.icon}</span>
      <span style="font-size:13px;font-weight:600;color:${alertColors[a.type]}">${a.msg}</span>
      <span style="margin-left:auto;font-size:12px;color:${alertColors[a.type]}">View →</span>
    </div>`).join('')}</div>`:'';

  const occ = DB.rooms.filter(r=>getRoomOccupancy(r)>0).length;
  const vac = DB.rooms.length - occ;
  const seatsRemainingInOccupiedRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0).reduce((s,r)=>{const cap=getRoomType(r)?.capacity||1;return s+(cap-getRoomOccupancy(r));},0);
  const activeStudents = DB.students.filter(t=>t.status==='Active').length;
  const mo = thisMonth();
  const moTransferDeduct = (DB.transfers||[]).filter(t=>t.date?.startsWith(mo)).reduce((s,t)=>s+Number(t.amount),0);
  const collected = calcRevenue(mo);   // Revenue — transfers do NOT reduce revenue
  // Pending — only for the selected month
  const pending = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo)).reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
  const pendingCount = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo)).length;
  const paidCount = DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,mo)).length;
  const overdue = 0; // overdue feature removed
  const moExp = DB.expenses.filter(e=>e.date?.startsWith(mo)).reduce((s,e)=>s+Number(e.amount),0);
  const totalExpected = collected + pending;
  // Transfer to owner is also an outgoing expense — include in net calculation
  const netProfit = collected - moExp - moTransferDeduct;

  // Seat calculations
  const totalSeats = DB.rooms.reduce((s,r)=>{ const t=DB.settings.roomTypes.find(x=>x.id===r.typeId); return s+(t?t.capacity:1); }, 0);
  const allActiveSeats = DB.students.filter(t=>t.status==='Active').length; // badge: counts ALL active including force-added
  const filledSeats = DB.students.filter(t=>t.status==='Active' && !t.isForced).length; // for available seat math only
  const availSeats = totalSeats - filledSeats;
  const seatPct = totalSeats>0 ? Math.round(filledSeats/totalSeats*100) : 0;

  // Per-room-type seat breakdown
  let seatBreakdown = '';
  DB.settings.roomTypes.forEach(type => {
    const tRooms = DB.rooms.filter(r=>r.typeId===type.id);
    const typeTotalSeats = tRooms.length * type.capacity;
    const typeFilledSeats = DB.students.filter(t=>t.status==='Active'&&!t.isForced&&tRooms.some(r=>r.id===t.roomId)).length;
    const typeAvail = typeTotalSeats - typeFilledSeats;
    const typePct = typeTotalSeats>0?Math.round(typeFilledSeats/typeTotalSeats*100):0;
    seatBreakdown += `
      <div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="width:10px;height:10px;border-radius:3px;background:${type.color};flex-shrink:0"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
            <span style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(type.name)}</span>
            <span style="font-size:12px;font-weight:700;color:var(--text2);font-family:var(--font-mono)">${typeFilledSeats}/${typeTotalSeats}</span>
          </div>
          <div style="height:5px;background:var(--bg4);border-radius:3px;overflow:hidden">
            <div style="height:100%;width:${typePct}%;background:${type.color};border-radius:3px;transition:width 0.5s"></div>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--green);font-weight:600">${typeAvail} free</div>
          <div style="font-size:10px;color:var(--text3)">${typePct}% full</div>
        </div>
      </div>`;
  });

  const recentPay = [...DB.payments].filter(p=>_payMatchesMonth(p,mo)).sort((a,b)=>new Date(b.date||b.dueDate)-new Date(a.date||a.dueDate)).slice(0,10);

  // Room type summary
  let roomTypeSummary = '';
  DB.settings.roomTypes.forEach(type=>{
    const tRooms = DB.rooms.filter(r=>r.typeId===type.id);
    const tOcc = tRooms.filter(r=>getRoomOccupancy(r)>0).length;
    const pct = tRooms.length ? Math.round(tOcc/tRooms.length*100) : 0;
    roomTypeSummary+=`<div class="card" style="padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(type.name)}</div>
        <div style="font-size:22px;font-weight:900;color:${escHtml(type.color)}">${tRooms.length}</div>
      </div>
      <div style="font-size:11px;color:var(--text3);margin-bottom:8px">${tOcc} occupied · ${tRooms.length-tOcc} vacant</div>
      <div class="room-occ-track"><div class="room-occ-fill" style="width:${pct}%;background:${escHtml(type.color)}"></div></div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;text-align:right">${pct}% occupied</div>
      <div style="font-size:12px;font-weight:700;color:var(--green);margin-top:6px">${fmtPKR(type.defaultRent)}/mo</div>
    </div>`;
  });

  // Seats availability bar chart data
  const pendingCancels = (DB.cancellations||[]).filter(c=>c.status==='Pending');

  return `
  ${pendingCancels.length>0?`
  <div style="background:linear-gradient(135deg,rgba(224,82,82,0.12),rgba(224,82,82,0.06));border:1px solid rgba(224,82,82,0.35);border-radius:var(--radius);padding:12px 18px;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer" onclick="navigate('cancellations')">
    <div style="display:flex;align-items:center;gap:10px"><span style="font-size:16px">🚨</span>
      <div><div style="font-size:13px;font-weight:700;color:var(--red)">${pendingCancels.length} Pending Cancellation${pendingCancels.length!==1?'s':''}</div>
      <div style="font-size:11px;color:var(--text3)">${pendingCancels.map(c=>escHtml(c.studentName)).join(', ')} — seats freed</div></div>
    </div>
    <button class="btn btn-danger btn-sm" style="font-size:11px">View →</button>
  </div>`:''}

  <!-- ══ ROW 1: KPI FINANCIAL CARDS ══ -->
  ${(()=>{const transfers=DB.transfers||[];const moTransfers=transfers.filter(t=>t.date?.startsWith(mo));const moTransferTotal=moTransfers.reduce((s,t)=>s+Number(t.amount),0);return `
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:12px">
    <div onclick="navigate('payments')" style="background:linear-gradient(145deg,#011828,#010f18);border:1px solid rgba(2,37,71,0.7);border-radius:var(--radius);padding:18px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(11,19,43,0.6)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#022547,transparent)"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(2,37,71,0.25);display:flex;align-items:center;justify-content:center;font-size:16px">💰</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#3a8fd4">Total Revenue</div>
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:#3a8fd4;background:rgba(2,37,71,0.2);padding:1px 6px;border-radius:20px;border:1px solid rgba(2,37,71,0.55)">${totalExpected>0?Math.round(collected/totalExpected*100):0}% · ${paidCount} paid</span>
      </div>
      <div style="font-size:32px;font-weight:800;color:var(--text);line-height:1;margin-bottom:7px;letter-spacing:-0.5px">${fmtPKR(collected)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:5px"><div style="height:100%;width:${totalExpected>0?Math.round(collected/totalExpected*100):0}%;background:#022547;border-radius:2px"></div></div>
      <div style="font-size:11px;color:var(--text3)">of ${fmtPKR(totalExpected)}</div>
    </div>
    <div onclick="navigate('reports')" style="background:linear-gradient(145deg,#041e26,#021318);border:1px solid rgba(35,181,211,0.35);border-radius:var(--radius);padding:18px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(35,181,211,0.2)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#23B5D3,transparent)"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(35,181,211,0.15);display:flex;align-items:center;justify-content:center;font-size:16px">📊</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#23B5D3">Available Fund</div>
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:#23B5D3;background:rgba(35,181,211,0.1);padding:1px 6px;border-radius:20px;border:1px solid rgba(35,181,211,0.28)">${netProfit>=0?'Profit':'Loss'}</span>
      </div>
      <div style="font-size:32px;font-weight:800;color:${netProfit>=0?'#23B5D3':'#D90429'};line-height:1;margin-bottom:7px;letter-spacing:-0.5px">${fmtPKR(netProfit)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:5px"><div style="height:100%;width:${collected>0?Math.min(100,Math.round(Math.abs(netProfit)/collected*100)):0}%;background:${netProfit>=0?'#23B5D3':'rgba(217,4,41,0.7)'};border-radius:2px"></div></div>
      <div style="font-size:11px;color:var(--text3)">${fmtPKR(collected)}${moTransferDeduct>0?` − ${fmtPKR(moTransferDeduct)} (owner)`:''} − ${fmtPKR(moExp)}</div>
    </div>
    <div onclick="navigate('expenses')" style="background:linear-gradient(145deg,#200108,#140105);border:1px solid rgba(171,44,32,0.5);border-radius:var(--radius);padding:18px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(217,4,41,0.2)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#ab2c20,transparent)"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(171,44,32,0.15);display:flex;align-items:center;justify-content:center;font-size:16px">📉</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#ab2c20">Expenses</div>
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:#ab2c20;background:rgba(171,44,32,0.1);padding:1px 6px;border-radius:20px;border:1px solid rgba(171,44,32,0.4)">${DB.expenses.filter(e=>e.date?.startsWith(mo)).length} items</span>
      </div>
      <div style="font-size:32px;font-weight:800;color:#ab2c20;line-height:1;margin-bottom:7px;letter-spacing:-0.5px">${fmtPKR(moExp)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:5px"><div style="height:100%;width:${collected>0?Math.min(100,Math.round(moExp/collected*100)):moExp>0?100:0}%;background:#ab2c20;border-radius:2px"></div></div>
      <div style="font-size:11px;color:var(--text3)">this month</div>
    </div>
    <!-- Transfer to Owner Card — also counted as expense in net calculation -->
    <div onclick="showAddTransferModal()" style="background:linear-gradient(145deg,#1a1a1a,#111111);border:1px solid rgba(191,192,192,0.28);border-radius:var(--radius);padding:18px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(191,192,192,0.12)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#BFC0C0,transparent)"></div>
      ${transfers.length>0?'<div style="position:absolute;top:9px;right:9px;width:6px;height:6px;border-radius:50%;background:#BFC0C0"></div>':''}
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(191,192,192,0.1);display:flex;align-items:center;justify-content:center;font-size:16px">🏦</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#BFC0C0">To Owner</div>
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:#BFC0C0;background:rgba(191,192,192,0.07);padding:1px 6px;border-radius:20px;border:1px solid rgba(191,192,192,0.2)">${moTransfers.length} records</span>
      </div>
      <div style="font-size:32px;font-weight:800;color:var(--text);line-height:1;margin-bottom:7px;letter-spacing:-0.5px">${fmtPKR(moTransferTotal)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:5px"><div style="height:100%;width:${moTransferTotal>0?Math.min(100,Math.round(moTransferTotal/(collected||1)*100)):0}%;background:#BFC0C0;border-radius:2px"></div></div>
      <div style="font-size:11px;color:var(--text3)">${moTransferTotal>0?'deducted from net':'+ New Transfer'}</div>
    </div>
    <div onclick="navigate('payments')" style="background:linear-gradient(145deg,#1f1000,#130a00);border:1px solid rgba(251,133,0,0.3);border-radius:var(--radius);padding:18px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(251,133,0,0.15)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#FB8500,transparent)"></div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:11px">
        <div style="width:36px;height:36px;border-radius:9px;background:rgba(251,133,0,0.15);display:flex;align-items:center;justify-content:center;font-size:16px">⏳</div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1.2px;color:#FB8500">Pending</div>
        <span style="margin-left:auto;font-size:10px;font-weight:600;color:#FB8500;background:rgba(251,133,0,0.1);padding:1px 6px;border-radius:20px;border:1px solid rgba(251,133,0,0.25)">${totalExpected>0?Math.round(pending/totalExpected*100):0}% · ${pendingCount} unpaid</span>
      </div>
      <div style="font-size:32px;font-weight:800;color:var(--text);line-height:1;margin-bottom:7px;letter-spacing:-0.5px">${fmtPKR(pending)}</div>
      <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-bottom:5px"><div style="height:100%;width:${totalExpected>0?Math.round(pending/totalExpected*100):0}%;background:#FB8500;border-radius:2px"></div></div>
      <div style="font-size:11px;color:var(--text3)">click to collect</div>
    </div>
  </div>`;})()}

  <!-- ══ STAT BADGES: Occupied | Vacant | Active ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:8px">
    <div onclick="showOccupiedRoomsModal()" style="background:linear-gradient(135deg,#041a10,#021009);border:1px solid rgba(68,212,144,0.45);border-radius:10px;padding:14px 16px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden;display:flex;align-items:center;gap:12px" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(75,125,100,0.25)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#44d490,transparent)"></div>
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(68,212,144,0.2);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🏠</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#44d490;margin-bottom:3px">Occupied Rooms</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-size:28px;font-weight:900;color:#44d490;line-height:1;letter-spacing:-0.5px">${occ}</span>
          <span style="font-size:11px;color:var(--text3)">of ${DB.rooms.length}</span>
          ${seatsRemainingInOccupiedRooms>0?`<span style="background:rgba(68,212,144,0.2);border:1px solid rgba(68,212,144,0.4);border-radius:20px;padding:2px 7px;font-size:9px;font-weight:800;color:#44d490">+${seatsRemainingInOccupiedRooms} free</span>`:''}
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${DB.rooms.length?Math.round(occ/DB.rooms.length*100):0}%;background:linear-gradient(90deg,#44d490,#6aedaa);border-radius:2px"></div></div>
      </div>
    </div>
    <div onclick="showVacantRoomsModal()" style="background:linear-gradient(135deg,#041a10,#021009);border:1px solid rgba(68,212,144,0.35);border-radius:10px;padding:14px 16px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden;display:flex;align-items:center;gap:12px" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(15,188,173,0.15)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--teal),transparent)"></div>
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(15,188,173,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🔑</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#44d490;margin-bottom:3px">Vacant Rooms</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-size:28px;font-weight:900;color:#44d490;line-height:1;letter-spacing:-0.5px">${vac}</span>
          <span style="font-size:11px;color:var(--text3)">${availSeats} seats free</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${DB.rooms.length?Math.round(vac/DB.rooms.length*100):0}%;background:linear-gradient(90deg,#44d490,#6aedaa);border-radius:2px"></div></div>
      </div>
    </div>
    <div onclick="navigate('students')" style="background:linear-gradient(135deg,#041a10,#021009);border:1px solid rgba(68,212,144,0.35);border-radius:10px;padding:14px 16px;cursor:pointer;transition:var(--transition);position:relative;overflow:hidden;display:flex;align-items:center;gap:12px" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(144,224,239,0.15)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,#90E0EF,transparent)"></div>
      <div style="width:40px;height:40px;border-radius:10px;background:rgba(144,224,239,0.15);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">🧑‍🎓</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#44d490;margin-bottom:3px">Active Students</div>
        <div style="display:flex;align-items:baseline;gap:6px">
          <span style="font-size:28px;font-weight:900;color:#44d490;line-height:1;letter-spacing:-0.5px">${activeStudents}</span>
          <span style="font-size:11px;color:var(--text3)">${DB.students.length} registered</span>
        </div>
        <div style="height:3px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;margin-top:6px"><div style="height:100%;width:${totalSeats>0?Math.round(activeStudents/totalSeats*100):0}%;background:linear-gradient(90deg,#44d490,#6aedaa);border-radius:2px"></div></div>
      </div>
    </div>
  </div>
  <!-- ══ TREND + SEAT AVAILABILITY ROW ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
  <div style="background:linear-gradient(180deg,#071220 0%,#040c16 100%);border:1px solid rgba(46,201,138,0.2);border-radius:var(--radius);padding:10px 14px 6px;position:relative;overflow:hidden">
    <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,#2ec98a,#0fbcad,transparent)"></div>
    <!-- Header: title row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
      <div style="display:flex;align-items:center;gap:8px">
        <div style="width:26px;height:26px;border-radius:7px;background:rgba(46,201,138,0.13);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0">📈</div>
        <div style="font-size:12px;font-weight:800;color:#e8eef8">Revenue Trend <span style="font-size:9px;font-weight:400;color:rgba(142,165,200,0.55)">· Jan–Dec</span></div>
      </div>
      <!-- Legend -->
      <div style="display:flex;align-items:center;gap:10px">
        <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:14px;height:2.5px;background:#00e676;border-radius:2px"></span><span style="font-size:9px;color:rgba(0,230,118,0.95);font-weight:700">Revenue</span></span>
        <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:14px;height:2.5px;background:#ff4d6d;border-radius:2px"></span><span style="font-size:9px;color:rgba(255,77,109,0.95);font-weight:700">Expenses</span></span>
        <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:14px;height:2.5px;background:#ff8c42;border-radius:2px"></span><span style="font-size:9px;color:rgba(255,140,66,0.95);font-weight:700">Transfers</span></span>
        <span style="display:flex;align-items:center;gap:3px"><span style="display:inline-block;width:12px;height:2px;background:#f0c040;border-radius:2px"></span><span style="font-size:9px;color:rgba(240,192,64,0.9);font-weight:600">Pending</span></span>
      </div>
    </div>
    <!-- KPI chips row -->
    <div style="display:flex;gap:6px;margin-bottom:6px">
      <div style="flex:1;background:rgba(46,201,138,0.08);border:1px solid rgba(46,201,138,0.18);border-radius:7px;padding:4px 8px;display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:9px;color:rgba(46,201,138,0.7);font-weight:700;text-transform:uppercase;letter-spacing:0.3px">Revenue</span>
        <span style="font-size:15px;font-weight:900;color:#2ec98a;letter-spacing:-0.5px">${fmtPKR(collected)}</span>
      </div>
      <div style="flex:1;background:rgba(224,82,82,0.08);border:1px solid rgba(224,82,82,0.15);border-radius:7px;padding:4px 8px;display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:9px;color:rgba(224,82,82,0.7);font-weight:700;text-transform:uppercase;letter-spacing:0.3px">Expenses</span>
        <span style="font-size:15px;font-weight:900;color:#e05252;letter-spacing:-0.5px">${fmtPKR(moExp)}</span>
      </div>
      <div style="flex:1;background:${netProfit>=0?'rgba(46,201,138,0.08)':'rgba(224,82,82,0.08)'};border:1px solid ${netProfit>=0?'rgba(46,201,138,0.15)':'rgba(224,82,82,0.15)'};border-radius:7px;padding:4px 8px;display:flex;align-items:baseline;justify-content:space-between">
        <span style="font-size:9px;color:${netProfit>=0?'rgba(46,201,138,0.7)':'rgba(224,82,82,0.7)'};font-weight:700;text-transform:uppercase;letter-spacing:0.3px">Net</span>
        <span style="font-size:13px;font-weight:900;color:${netProfit>=0?'#2ec98a':'#e05252'};letter-spacing:-0.3px">${netProfit>=0?'+':''}${fmtPKR(netProfit)}</span>
      </div>
    </div>
    <!-- Chart.js canvas -->
    <div id="trend-chart-wrap" style="position:relative;height:160px;">
      <div id="trend-hb" style="position:fixed;background:#0f1c2e;border:1px solid #2a3d52;border-radius:10px;padding:12px 14px;font-size:12px;pointer-events:none;display:none;z-index:9999;min-width:210px;box-shadow:0 8px 24px rgba(0,0,0,.6);"></div>
      <canvas id="trend-canvas" style="display:block"></canvas>
    </div>
  </div>
  <!-- Seat availability — interactive room grid -->
    <div style="background:var(--card);border:1px solid var(--border);border-radius:var(--radius);padding:10px;position:relative;overflow:hidden">
      <div style="position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,var(--green),var(--teal),var(--purple))"></div>
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:8px;background:var(--teal-dim);display:flex;align-items:center;justify-content:center;font-size:14px">🛏️</div>
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--teal)">Seat Availability</div>
        </div>
        <div style="display:flex;gap:6px">
          <button onclick="printSeatAvailability()" style="font-size:10px;background:var(--bg3);border:1px solid var(--border2);color:var(--text2);border-radius:6px;padding:3px 9px;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px"><span class="micon" style="font-size:13px">print</span>Print</button>
          <button onclick="showSeatDetailModal('rooms')" style="font-size:10px;background:var(--bg3);border:1px solid var(--border2);color:var(--text2);border-radius:6px;padding:3px 9px;cursor:pointer;font-weight:600">Expand ↗</button>
        </div>
      </div>
      <!-- Summary row -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-bottom:10px">
        <div onclick="showSeatDetailModal('rooms')" style="background:rgba(15,188,173,0.1);border:1px solid rgba(15,188,173,0.2);border-radius:8px;padding:7px;text-align:center;cursor:pointer" title="All rooms">
          <div style="font-size:20px;font-weight:900;color:var(--teal)">${totalSeats}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Total</div>
        </div>
        <div onclick="showSeatDetailModal('vacant')" style="background:rgba(46,201,138,0.1);border:1px solid rgba(46,201,138,0.2);border-radius:8px;padding:7px;text-align:center;cursor:pointer" title="Free seats">
          <div style="font-size:20px;font-weight:900;color:var(--green)">${availSeats}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Free</div>
        </div>
        <div onclick="showSeatDetailModal('occupied')" style="background:rgba(224,82,82,0.1);border:1px solid rgba(224,82,82,0.2);border-radius:8px;padding:7px;text-align:center;cursor:pointer" title="Filled seats">
          <div style="font-size:20px;font-weight:900;color:var(--red)">${allActiveSeats}</div>
          <div style="font-size:9px;color:var(--text3);text-transform:uppercase;font-weight:600">Filled</div>
        </div>
      </div>
      <!-- Per-room mini tiles -->
      <div style="display:flex;flex-wrap:wrap;gap:4px;max-height:88px;overflow-y:auto">
        ${DB.rooms.map(r=>{
          const rtype2=getRoomType(r);
          const cap=rtype2?.capacity||1;
          const occ2=getRoomOccupancy(r);
          const free=cap-occ2;
          const pct=Math.round(occ2/cap*100);
          const isFull=free===0;
          const students2=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
          return `<div onclick="showRoomSeatDetailModal('${r.id}')" title="Room #${r.number} — ${occ2}/${cap} filled, ${free} free — click to edit" style="background:${isFull?'rgba(46,201,138,0.12)':'rgba(200,168,75,0.1)'};border:1px solid ${isFull?'rgba(46,201,138,0.3)':'rgba(200,168,75,0.3)'};border-radius:6px;padding:5px 7px;cursor:pointer;min-width:38px;text-align:center;transition:all 0.15s" onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.3)'" onmouseout="this.style.transform='';this.style.boxShadow=''">
            <div style="font-size:11px;font-weight:900;color:${isFull?'var(--green)':'var(--gold2)'}">${r.number}</div>
            <div style="font-size:9px;color:var(--text3)">${occ2}/${cap}</div>
            <div style="height:3px;background:var(--bg4);border-radius:2px;margin-top:3px;overflow:hidden"><div style="height:100%;width:${pct}%;background:${isFull?'var(--green)':'var(--gold)'};border-radius:2px"></div></div>
          </div>`;
        }).join('')}
      </div>
      <div style="display:flex;gap:10px;margin-top:8px;flex-wrap:wrap">
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;border-radius:2px;background:var(--gold)"></div><span style="font-size:10px;color:var(--text3)">Has free seats</span></div>
        <div style="display:flex;align-items:center;gap:4px"><div style="width:8px;height:8px;border-radius:2px;background:var(--green)"></div><span style="font-size:10px;color:var(--text3)">Full</span></div>
        <span style="font-size:10px;color:var(--text3);margin-left:auto">👆 tap any room</span>
      </div>
    </div>
  </div><!-- end 2-col trend+seat grid -->

  <!-- ══ ROW 3+4: BY ROOM TYPE + PENDING PAYMENTS (same row) ══ -->
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">
  <div class="card" style="position:relative;margin-bottom:0">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--teal),var(--blue));border-radius:var(--radius) var(--radius) 0 0"></div>
    <div class="card-header" style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:4px">
      <div class="card-title" style="font-size:16px"><span class="dash-pill-heading" style="background:rgba(15,188,173,0.1);border-color:rgba(15,188,173,0.25);color:var(--teal)"><span class="micon" style="font-size:16px">bed</span>By Room Type</span></div>
      <span style="font-size:12px;color:var(--teal);font-weight:800;background:var(--teal-dim);padding:3px 10px;border-radius:20px;border:1px solid rgba(15,188,173,0.25)">${seatPct}% full</span>
    </div>
    <div style="height:5px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-bottom:12px">
      <div style="height:100%;width:${seatPct}%;background:linear-gradient(90deg,var(--green),var(--gold));border-radius:3px;transition:width 0.6s"></div>
    </div>
    ${seatBreakdown.replace(/<div style="display:flex;align-items:center;gap:14px;padding:10px 0;border-bottom:1px solid var\(--border\)">/g,'<div style="display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid rgba(30,48,80,0.5)">')}
  </div>
  <!-- PENDING PAYMENTS -->
  <div class="card" style="position:relative;display:flex;flex-direction:column;margin-bottom:0">
      <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--gold),var(--amber))"></div>
      <div class="card-header" style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:0">
        <div class="card-title" style="font-size:16px"><span class="dash-pill-heading" style="background:rgba(200,168,75,0.1);border-color:rgba(200,168,75,0.25);color:var(--gold2)"><span class="micon" style="font-size:16px">schedule</span>Pending Payments</span></div>
        <span class="badge badge-gold" style="font-size:12px;padding:4px 10px">${pendingCount}</span>
      </div>
      <div style="flex:1;overflow-y:auto;max-height:280px;padding-top:6px">
      ${(()=>{const moPending=DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,mo));return moPending.length===0?
        '<div style="padding:32px;text-align:center;color:var(--text3)"><div style="font-size:36px;margin-bottom:10px">🎉</div><div style="font-size:14px;font-weight:600">All cleared!</div></div>':
        moPending.slice(0,10).map(p=>{
          const unpaidShow = p.unpaid!=null?p.unpaid:p.amount;
          return '<div style="display:flex;justify-content:space-between;align-items:center;padding:9px 0;border-bottom:1px solid rgba(30,48,80,0.5)">'
          +'<div onclick="showViewStudentModal(\''+p.studentId+'\')" style="cursor:pointer;flex:1;min-width:0">'
          +'<div style="font-size:13px;font-weight:700;color:var(--blue);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+escHtml(p.studentName||'')+'</div>'
          +'<div style="font-size:10px;color:var(--text3);margin-top:1px">Rm #'+(p.roomNumber||'?')+' · '+escHtml(p.month||'—')+'</div>'
          +'</div>'
          +'<div style="display:flex;align-items:center;gap:5px;flex-shrink:0;margin-left:8px">'
          +'<div style="text-align:right">'
          +'<div style="font-size:12px;font-weight:800;color:var(--red)">'+fmtPKR(unpaidShow)+'</div>'
          +'<div style="font-size:9px;color:var(--text3)">unpaid</div>'
          +'</div>'
          +'<button class="btn btn-success btn-sm" onclick="event.stopPropagation();markPaymentPaid(\''+p.id+'\');renderPage(\'dashboard\')" style="font-size:10px;padding:3px 7px" title="Mark paid"><span class=\"micon\" style=\"font-size:14px\">check_circle</span></button>'
          +'<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation();showEditPaymentModal(\''+p.id+'\')" style="font-size:10px;padding:3px 7px" title="Edit"><span class=\"micon\" style=\"font-size:14px\">edit</span></button>'
          +'</div></div>';
        }).join('')})()}
      </div>
      ${pendingCount>0?`<div style="padding-top:10px;border-top:1px solid var(--border);margin-top:auto;display:flex;gap:8px"><button class="btn btn-secondary btn-sm" style="flex:1" onclick="navigate('payments')">View All →</button><button class="btn btn-sm" style="flex:1;background:#25d366;color:#fff;border:none" onclick="showRentReminderModal()"><span class=\"micon\" style=\"font-size:14px\">chat</span> Remind</button></div>`:''}
    </div>
  </div>
  </div><!-- end row3+4 grid -->

  <!-- ══ ROW 5: RECENT PAYMENTS ══ -->
  <div class="card" style="position:relative">
    <div style="position:absolute;top:0;left:0;right:0;height:3px;background:linear-gradient(90deg,var(--blue),var(--purple))"></div>
    <div class="card-header" style="padding-bottom:10px;border-bottom:1px solid var(--border);margin-bottom:4px">
      <div class="card-title" style="font-size:16px"><span class="dash-pill-heading" style="background:rgba(74,156,240,0.1);border-color:rgba(74,156,240,0.25);color:var(--blue)"><span class="micon" style="font-size:16px">credit_card</span>Recent Payments</span></div>
      <button class="btn btn-secondary btn-sm" onclick="navigate('payments')" style="font-size:11px">View All →</button>
    </div>
    ${recentPay.length===0?'<div style="padding:32px;text-align:center;color:var(--text3)"><div style="font-size:36px;margin-bottom:10px">💳</div><div style="font-size:14px;font-weight:600">No payments yet</div></div>':
    '<div class="table-wrap" style="border:none">'
    +'<table><thead><tr><th style="font-size:10px">Student</th><th style="font-size:10px">Room</th><th style="font-size:10px">Monthly Rent</th><th style="font-size:10px">Paid (+Extras)</th><th style="font-size:10px">Unpaid</th><th style="font-size:10px">Method</th><th style="font-size:10px">Status</th><th style="font-size:10px">Date</th></tr></thead><tbody>'
    +recentPay.map(p=>{
      const st2 = DB.students.find(s=>s.id===p.studentId);
      const mRent = p.monthlyRent||p.totalRent||st2?.rent||0;
      const admFee = Number(p.fee||0);
      const extras = p.extraCharges||[];
      const unpaidAmt2=p.unpaid!=null?p.unpaid:0;
      let paidCell='<span style="color:var(--green);font-weight:700;font-size:12px">'+fmtPKR(p.amount)+'</span>';
      if(admFee>0) paidCell+='<div style="font-size:10px;color:var(--blue);font-weight:700">+'+fmtPKR(admFee)+' adm.</div>';
      extras.forEach(c=>{paidCell+='<div style="font-size:10px;color:var(--amber);font-weight:700">+'+fmtPKR(c.amount)+' '+escHtml(c.label||'')+'</div>';});
      return '<tr style="cursor:pointer" onclick="showViewStudentModal(\''+p.studentId+'\')">'
      +'<td><div style="display:flex;align-items:center;gap:7px">'
      +'<div style="width:26px;height:26px;border-radius:7px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:11px;flex-shrink:0">'+(p.studentName||'?')[0].toUpperCase()+'</div>'
      +'<span style="font-weight:700;color:var(--blue);font-size:12px">'+escHtml(p.studentName||'')+'</span></div></td>'
      +'<td><span style="color:var(--gold2);font-weight:700;font-size:12px">#'+(p.roomNumber||'')+'</span></td>'
      +'<td><span style="font-weight:700;font-size:12px">'+(mRent>0?fmtPKR(mRent):'—')+'</span></td>'
      +'<td>'+paidCell+'</td>'
      +'<td><span style="color:'+(unpaidAmt2>0?'var(--red)':'var(--text3)')+';font-weight:700;font-size:12px">'+(unpaidAmt2>0?fmtPKR(unpaidAmt2):'—')+'</span></td>'
      +'<td>'+pmBadge(p.method)+'</td>'
      +'<td>'+statusBadge(p.status)+'</td>'
      +'<td style="font-size:11px;color:var(--text3)">'+fmtDate(p.date)+'</td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div>'}
  </div>`;
}

function showRoomSeatDetailModal(roomId) {
  const r = DB.rooms.find(x=>x.id===roomId); if(!r) return;
  const rtype = getRoomType(r);
  const cap = rtype?.capacity||1;
  const students = DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
  const occ = students.length;
  const free = cap - occ;
  const isFull = free===0;

  // Build seat slots
  let seatSlots = '';
  for(let i=0;i<cap;i++){
    const s = students[i];
    if(s){
      seatSlots += `<div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:9px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:7px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;flex-shrink:0">${s.name[0]}</div>
          <div>
            <div style="font-weight:700;font-size:13px;color:var(--text)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>
        <div style="display:flex;gap:5px">
          <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="closeModal();showViewStudentModal('${s.id}')">👁 View</button>
          <button class="btn btn-secondary btn-sm" style="font-size:10px" onclick="closeModal();showEditStudentModal('${s.id}')">✏️ Edit</button>
        </div>
      </div>`;
    } else {
      seatSlots += `<div style="background:var(--amber-dim);border:1px dashed rgba(200,168,75,0.4);border-radius:9px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;gap:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:28px;height:28px;border-radius:7px;background:rgba(200,168,75,0.1);display:flex;align-items:center;justify-content:center;font-size:14px">🪑</div>
          <div style="font-size:13px;color:var(--text3);font-style:italic">Seat ${i+1} — Free</div>
        </div>
        <button class="btn btn-primary btn-sm" style="font-size:10px" onclick="closeModal();showAddStudentModal('${r.id}')">+ Add Student</button>
      </div>`;
    }
  }

  showModal('modal-md', `🛏️ Room #${r.number} — Seat Details`,`
    <!-- Room header -->
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:10px;padding:14px 16px;margin-bottom:18px;display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;text-align:center">
      <div>
        <div style="font-size:22px;font-weight:900;color:var(--gold2)">#${r.number}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Room</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:var(--text)">${rtype?.name||'—'}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Type</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:${isFull?'var(--green)':'var(--gold2)'}">${occ}/${cap}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Occupied</div>
      </div>
      <div>
        <div style="font-size:22px;font-weight:900;color:${free>0?'var(--teal)':'var(--text3)'}">${free}</div>
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase">Free</div>
      </div>
    </div>
    <!-- Progress bar -->
    <div style="height:6px;background:var(--bg4);border-radius:3px;overflow:hidden;margin-bottom:18px">
      <div style="height:100%;width:${Math.round(occ/cap*100)}%;background:${isFull?'var(--green)':'var(--gold)'};border-radius:3px;transition:width 0.5s"></div>
    </div>
    <!-- Seat slots -->
    <div style="display:flex;flex-direction:column;gap:8px">${seatSlots}</div>
  `,`
    <button class="btn btn-secondary" onclick="closeModal();showRoomDetail('${r.id}')">🏠 Full Room Details</button>
    ${free>0?`<button class="btn btn-primary" onclick="closeModal();showAddStudentModal('${r.id}')">+ Add Student</button>`:''}
    <button class="btn btn-secondary" onclick="closeModal()">Close</button>
  `);
}


// ── SEAT AVAILABILITY PRINT REPORT ──────────────────────────────────────────
function printSeatAvailability() {
  const hostel = DB.settings.hostelName || 'DAMAM Boys Hostel';
  const location = DB.settings.location || '';
  const now2 = new Date().toLocaleDateString('en-PK',{day:'2-digit',month:'long',year:'numeric'});
  const totalSeats = DB.rooms.reduce((s,r)=>{const t=DB.settings.roomTypes.find(x=>x.id===r.typeId);return s+(t?t.capacity:1);},0);
  const allActiveSeats2 = DB.students.filter(t=>t.status==='Active').length; // badge: ALL active
  const filledSeats = DB.students.filter(t=>t.status==='Active' && !t.isForced).length; // for free seat calc
  const freeSeats = totalSeats - filledSeats;
  const floors = [...new Set(DB.rooms.map(r=>r.floor||'Unknown'))].sort();
  let body = '';

  floors.forEach(floor => {
    const floorRooms = DB.rooms.filter(r=>(r.floor||'Unknown')===floor).sort((a,b)=>a.number-b.number);
    body += `<div class="floor-label">${floor} Floor</div><div class="room-grid">`;

    floorRooms.forEach(r => {
      const rtype = DB.settings.roomTypes.find(t=>t.id===r.typeId);
      const cap = rtype ? rtype.capacity : 1;
      const students = DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
      const occ = students.length;
      const free = cap - occ;
      const isFull = free === 0;
      const hasBath = (r.amenities||[]).some(a=>/bath|attach/i.test(a));

      const labelStyle = r.roomLabelFont ? `font-family:${r.roomLabelFont};` : '';
      body += `<div class="room-box ${isFull?'full':'partial'}">
        <div class="room-top">
          <span class="rnum" style="${labelStyle}">${r.roomLabel ? r.roomLabel+' · ' : ''}Rm #${r.number}</span>
          <span class="rtype">${rtype?rtype.name:'—'}</span>
          ${hasBath?'<span class="bath">🚿 Bath</span>':''}
          <span class="seats ${isFull?'seats-full':'seats-free'}">${isFull?'Full':free+' free'}</span>
        </div>
        <div class="occ-bar"><div style="width:${Math.round(occ/cap*100)}%;background:${isFull?'#16a34a':'#dc2626'};height:100%;border-radius:2px"></div></div>`;

      if (students.length) {
        students.forEach((s,i) => {
          body += `<div class="student-row"><span class="snum">${i+1}</span><span class="sname">${escHtml(s.name)}</span><span class="scourse">${escHtml(s.occupation||'—')}</span></div>`;
        });
      } else {
        body += `<div class="empty-row">— Vacant —</div>`;
      }
      // Outgoing: students with pending/confirmed cancellation in this room
      const outgoing = (DB.cancellations||[]).filter(c=>c.roomId===r.id&&(c.status==='Pending'||c.status==='Confirmed'));
      outgoing.forEach(c => {
        const vacDate = c.vacateDate ? new Date(c.vacateDate+'T00:00:00').toLocaleDateString('en-PK',{day:'2-digit',month:'short',year:'numeric'}) : 'TBD';
        body += `<div class="student-row outgoing-row"><span class="snum">↩</span><span class="sname" style="text-decoration:line-through;color:#999">${escHtml(c.studentName||'—')}</span><span class="out-badge">Out Going · ${vacDate}</span></div>`;
      });

      // Empty seat slots
      for(let i=occ;i<cap;i++){
        body += `<div class="seat-slot">Seat ${i+1} <span style="color:#bbb">— available —</span></div>`;
      }
      body += `</div>`;
    });
    body += `</div>`;
  });

  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Room Visit Sheet</title>
  <style>
    @page { size: A4; margin: 10mm 10mm; }
    @media print { .no-print{display:none!important} }
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:11px;color:#111;background:#fff;padding:10px}
    .header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px}
    .header h1{font-size:18px;font-weight:900;color:#0f1a2e}
    .header .sub{font-size:10px;color:#666;margin-top:2px}
    .header .date{font-size:11px;font-weight:700;text-align:right;color:#333}
    .summary{display:flex;gap:8px;margin-bottom:12px}
    .sbox{flex:1;border:1.5px solid #ddd;border-radius:5px;padding:6px 10px;text-align:center}
    .sbox .v{font-size:20px;font-weight:900}
    .sbox .l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#888}
    .floor-label{font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:2px;color:#fff;background:#0f1a2e;padding:5px 10px;border-radius:4px;margin:10px 0 6px}
    .room-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin-bottom:4px}
    .room-box{border:1.5px solid #ccc;border-radius:6px;padding:7px 9px;page-break-inside:avoid}
    .room-box.full{border-color:#16a34a;background:#f0fff5}
    .room-box.partial{border-color:#d97706;background:#fffdf0}
    .room-top{display:flex;align-items:center;gap:5px;margin-bottom:4px;flex-wrap:wrap}
    .rnum{font-size:13px;font-weight:900;color:#0f1a2e}
    .rtype{font-size:9px;background:#eee;border-radius:20px;padding:1px 6px;color:#555}
    .bath{font-size:9px;background:#e0f2fe;color:#0369a1;border-radius:20px;padding:1px 6px;font-weight:700}
    .seats{font-size:9px;font-weight:800;margin-left:auto;padding:1px 7px;border-radius:20px}
    .seats-full{background:#dcfce7;color:#15803d}
    .seats-free{background:#fef3c7;color:#b45309}
    .occ-bar{height:3px;background:#eee;border-radius:2px;margin-bottom:5px;overflow:hidden}
    .student-row{display:flex;align-items:center;gap:5px;padding:2px 0;border-bottom:1px dashed #eee;font-size:10px}
    .snum{width:14px;color:#aaa;font-weight:700;flex-shrink:0}
    .sname{font-weight:700;flex:1;color:#111}
    .scourse{color:#0369a1;font-size:9px;font-weight:700;background:#e0f2fe;border-radius:20px;padding:1px 6px;white-space:nowrap}
    .empty-row{font-size:10px;color:#aaa;font-style:italic;padding:2px 0}
    .seat-slot{font-size:10px;color:#bbb;padding:2px 0;border-bottom:1px dashed #f0f0f0}
    .outgoing-row{opacity:0.75}
    .out-badge{font-size:8px;font-weight:800;background:#fee2e2;color:#dc2626;border-radius:20px;padding:1px 6px;white-space:nowrap;margin-left:auto}
    .footer{margin-top:12px;text-align:center;font-size:9px;color:#aaa;border-top:1px solid #eee;padding-top:6px}
    .print-btn{display:block;margin:0 auto 12px;padding:8px 24px;background:#0f1a2e;color:#e6c96e;border:none;border-radius:5px;font-size:13px;font-weight:700;cursor:pointer}
  </style></head><body>
  <button class="print-btn no-print" onclick="window.print()">🖨️ Print Visit Sheet</button>
  <div class="header">
    <div>
      <h1>${escHtml(hostel)}</h1>
      <div class="sub">${escHtml(location)}</div>
      <div class="sub" style="margin-top:2px;font-weight:700">ROOM VISIT SHEET</div>
    </div>
    <div class="date">${now2}<br><span style="font-size:9px;color:#aaa">Carry this during room visits</span></div>
  </div>
  <div class="summary">
    <div class="sbox"><div class="v">${DB.rooms.length}</div><div class="l">Rooms</div></div>
    <div class="sbox"><div class="v" style="color:#111">${totalSeats}</div><div class="l">Total Seats</div></div>
    <div class="sbox"><div class="v" style="color:#dc2626">${allActiveSeats2}</div><div class="l">Occupied</div></div>
    <div class="sbox"><div class="v" style="color:#16a34a">${freeSeats}</div><div class="l">Available</div></div>
  </div>
  ${body}
  <div class="footer">${escHtml(hostel)} · Room Visit Sheet · ${now2}</div>
  </body></html>`;

  _electronPDF(html, (DB.settings.hostelName||'Hostel').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_Room-Visit-Sheet_'+new Date().toISOString().slice(0,10)+'.pdf', {pageSize:'A4'});
}
// ─────────────────────────────────────────────────────────────────────────────
function showSeatDetailModal(type) {
  if(type==='rooms') {
    // Show full room grid modal
    const allRooms = DB.rooms;
    let content = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
    allRooms.forEach(r=>{
      const rt=getRoomType(r); const cap=rt?.capacity||1; const occ2=getRoomOccupancy(r); const free=cap-occ2;
      content+=`<div onclick="closeModal();showRoomSeatDetailModal('${r.id}')" style="background:${free===0?'var(--green-dim)':'var(--amber-dim)'};border:1px solid ${free===0?'rgba(46,201,138,0.3)':'rgba(200,168,75,0.3)'};border-radius:10px;padding:12px;cursor:pointer;transition:all 0.15s" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform=''">
        <div style="font-size:18px;font-weight:900;color:var(--text)">Rm #${r.number}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${rt?.name||'—'} · Floor ${r.floor||'?'}</div>
        <div style="margin-top:8px;display:flex;justify-content:space-between">
          <span style="font-size:12px;font-weight:700;color:${free===0?'var(--green)':'var(--gold2)'}">Occ: ${occ2}/${cap}</span>
          <span style="font-size:12px;font-weight:700;color:${free>0?'var(--teal)':'var(--text3)'}">${free} free</span>
        </div>
        <div style="height:4px;background:var(--bg4);border-radius:2px;margin-top:6px;overflow:hidden"><div style="height:100%;width:${Math.round(occ2/cap*100)}%;background:${free===0?'var(--green)':'var(--gold)'};border-radius:2px"></div></div>
      </div>`;
    });
    content += '</div>';
    showModal('modal-xl','🛏️ All Rooms — Seat Availability',`<div style="max-height:500px;overflow-y:auto">${content}</div>`);
    return;
  }
  let title, color, rows='';
  if(type==='vacant') {
    title='🔑 Vacant Rooms — Free Seats';
    color='var(--gold)';
    const vacantRooms = DB.rooms.filter(r=>{
      const occ=getRoomOccupancy(r);
      const cap=getRoomType(r)?.capacity||1;
      return occ < cap;
    });
    if(!vacantRooms.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No vacant rooms</div>';}
    else vacantRooms.forEach(r=>{
      const type=getRoomType(r);
      const occ=getRoomOccupancy(r);
      const cap=type?.capacity||1;
      const free=cap-occ;
      rows+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div>
          <div style="font-weight:700;color:var(--text)">Room #${r.number}</div>
          <div style="font-size:12px;color:var(--text3)">${type?.name||'—'} · Floor ${r.floor||'?'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:13px;font-weight:700;color:var(--green)">${free} free seat${free!==1?'s':''}</div>
          <div style="font-size:11px;color:var(--text3)">${occ}/${cap} occupied</div>
        </div>
      </div>`;
    });
  } else if(type==='occupied') {
    title='🏠 Occupied Rooms — Filled Seats';
    color='var(--green)';
    const occRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0);
    if(!occRooms.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No occupied rooms</div>';}
    else occRooms.forEach(r=>{
      const rtype=getRoomType(r);
      const occ=getRoomOccupancy(r);
      const cap=rtype?.capacity||1;
      const students=DB.students.filter(s=>s.roomId===r.id&&s.status==='Active');
      rows+=`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">
          <div>
            <span style="font-weight:700;color:var(--text)">Room #${r.number}</span>
            <span style="font-size:12px;color:var(--text3);margin-left:8px">${rtype?.name||'—'} · Floor ${r.floor||'?'}</span>
          </div>
          <span style="font-size:12px;font-weight:700;color:var(--green)">${occ}/${cap} filled</span>
        </div>
        ${students.map(s=>`<div style="display:flex;align-items:center;gap:8px;padding:4px 0;padding-left:8px;border-left:2px solid var(--green)">
          <div style="width:26px;height:26px;border-radius:7px;background:var(--gold-dim);color:var(--gold2);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:11px;flex-shrink:0">${s.name[0]}</div>
          <div>
            <div style="font-size:13px;font-weight:600;color:var(--text)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>`).join('')}
      </div>`;
    });
  } else {
    title='🧑‍🎓 Students in Occupied Rooms';
    color='var(--purple)';
    const activeStudents=DB.students.filter(s=>s.status==='Active');
    if(!activeStudents.length){rows='<div style="padding:24px;text-align:center;color:var(--text3)">No active students</div>';}
    else activeStudents.forEach(s=>{
      const room=DB.rooms.find(r=>r.id===s.roomId);
      const rtype=room?getRoomType(room):null;
      rows+=`<div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="closeModal();showViewStudentModal('${s.id}')">
        <div style="display:flex;align-items:center;gap:10px">
          <div style="width:32px;height:32px;border-radius:9px;background:var(--purple-dim);color:var(--purple);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:14px;flex-shrink:0">${s.name[0]}</div>
          <div>
            <div style="font-weight:700;color:var(--blue)">${escHtml(s.name)}</div>
            <div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'No phone')}</div>
          </div>
        </div>
        <div style="text-align:right">
          <div style="font-size:12px;font-weight:700;color:var(--gold2)">Rm #${room?.number||'?'}</div>
          <div style="font-size:11px;color:var(--text3)">${rtype?.name||'—'}</div>
        </div>
      </div>`;
    });
  }
  showModal('modal-md', title,
    `<div style="border-top:3px solid ${color};margin:-24px -24px 16px;padding:14px 20px;background:var(--bg3)">
      <span style="font-size:12px;color:var(--text3)">Click rows to view details</span>
    </div>
    <div style="max-height:400px;overflow-y:auto">${rows}</div>`);
}

function showOccupiedRoomsModal() {
  const occRooms = DB.rooms.filter(r=>getRoomOccupancy(r)>0);
  const rows = occRooms.map(r=>{
    const type=getRoomType(r);
    const students=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
    const occ=students.length;
    const cap=type.capacity;
    return `<tr>
      <td><span style="font-size:16px;font-weight:900;color:var(--gold2)">#${r.number}</span></td>
      <td><span class="badge" style="background:${type.color}22;border-color:${type.color}44;color:${type.color}">${escHtml(type.name)}</span></td>
      <td class="text-muted">${r.floor} Floor</td>
      <td><span class="badge badge-green">${occ}/${cap} beds</span></td>
      <td class="text-green fw-700">${fmtPKR(r.rent)}/mo</td>
      <td>${students.map(s=>`<div style="font-size:12px;color:var(--text);font-weight:600">• ${escHtml(s.name)}</div>`).join('')||'—'}</td>
      <td><button class="btn btn-secondary btn-sm" style="font-size:11px" onclick="closeModal();showRoomDetail('${r.id}')">View</button></td>
    </tr>`;
  }).join('');
  showModal('modal-xl','🏠 Occupied Rooms',`
    <div style="margin-bottom:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:1px;font-weight:700">Occupied Rooms</div>
        <div style="font-size:26px;font-weight:900;color:var(--green)">${occRooms.length}</div>
      </div>
      <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:1px;font-weight:700">Total Students</div>
        <div style="font-size:26px;font-weight:900;color:var(--blue)">${DB.students.filter(t=>t.status==='Active').length}</div>
      </div>
      <div style="background:var(--gold-dim);border:1px solid rgba(200,168,75,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--gold2);text-transform:uppercase;letter-spacing:1px;font-weight:700">Filled Seats</div>
        <div style="font-size:26px;font-weight:900;color:var(--gold2)">${occRooms.reduce((s,r)=>s+getRoomOccupancy(r),0)}</div>
      </div>
      <div style="background:var(--purple-dim);border:1px solid rgba(155,109,240,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--purple);text-transform:uppercase;letter-spacing:1px;font-weight:700">Monthly Revenue</div>
        <div style="font-size:18px;font-weight:900;color:var(--purple)">${fmtPKR(occRooms.reduce((s,r)=>{const sts=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');return s+sts.reduce((ss,t)=>ss+Number(t.rent),0);},0))}</div>
      </div>
      <div style="background:var(--teal-dim);border:1px solid rgba(15,188,173,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--teal);text-transform:uppercase;letter-spacing:1px;font-weight:700">Occupancy Rate</div>
        <div style="font-size:26px;font-weight:900;color:var(--teal)">${DB.rooms.length?Math.round(occRooms.length/DB.rooms.length*100):0}%</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupancy</th><th>Rent</th><th>Students</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:24px">No occupied rooms</td></tr>'}</tbody>
      </table>
    </div>`);
}

function showVacantRoomsModal() {
  const vacRooms = DB.rooms.filter(r=>{
    const type=getRoomType(r);
    const occ=getRoomOccupancy(r);
    return occ < type.capacity;
  });
  const rows = vacRooms.map(r=>{
    const type=getRoomType(r);
    const occ=getRoomOccupancy(r);
    const avail=type.capacity-occ;
    const students=DB.students.filter(t=>t.roomId===r.id&&t.status==='Active');
    return `<tr>
      <td><span style="font-size:16px;font-weight:900;color:var(--gold2)">#${r.number}</span></td>
      <td><span class="badge" style="background:${type.color}22;border-color:${type.color}44;color:${type.color}">${escHtml(type.name)}</span></td>
      <td class="text-muted">${r.floor} Floor</td>
      <td><span class="badge badge-gold">${occ}/${type.capacity} occupied</span></td>
      <td><span class="badge badge-green" style="font-size:13px;padding:5px 12px">${avail} seat${avail!==1?'s':''} free</span></td>
      <td class="text-green fw-700">${fmtPKR(r.rent)}/mo</td>
      <td>${students.length?students.map(s=>`<div style="font-size:12px;color:var(--text2)">• ${escHtml(s.name)}</div>`).join(''):'<span style="font-size:12px;color:var(--text3)">Empty</span>'}</td>
      <td><button class="btn btn-primary btn-sm" style="font-size:11px" onclick="closeModal();showAddStudentModal('${r.id}')">+ Student</button></td>
    </tr>`;
  }).join('');
  const totalAvail=vacRooms.reduce((s,r)=>{const type=getRoomType(r);return s+(type.capacity-getRoomOccupancy(r));},0);
  showModal('modal-xl','🔑 Rooms with Available Seats',`
    <div style="margin-bottom:14px;display:grid;grid-template-columns:repeat(5,1fr);gap:10px">
      <div style="background:var(--teal-dim);border:1px solid rgba(15,188,173,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--teal);text-transform:uppercase;letter-spacing:1px;font-weight:700">Rooms w/ Space</div>
        <div style="font-size:26px;font-weight:900;color:var(--teal)">${vacRooms.length}</div>
      </div>
      <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--green);text-transform:uppercase;letter-spacing:1px;font-weight:700">Free Seats</div>
        <div style="font-size:26px;font-weight:900;color:var(--green)">${totalAvail}</div>
      </div>
      <div style="background:var(--gold-dim);border:1px solid rgba(200,168,75,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--gold2);text-transform:uppercase;letter-spacing:1px;font-weight:700">Fully Empty</div>
        <div style="font-size:26px;font-weight:900;color:var(--gold2)">${vacRooms.filter(r=>getRoomOccupancy(r)===0).length}</div>
      </div>
      <div style="background:var(--blue-dim);border:1px solid rgba(74,156,240,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--blue);text-transform:uppercase;letter-spacing:1px;font-weight:700">Partial Rooms</div>
        <div style="font-size:26px;font-weight:900;color:var(--blue)">${vacRooms.filter(r=>getRoomOccupancy(r)>0).length}</div>
      </div>
      <div style="background:var(--purple-dim);border:1px solid rgba(155,109,240,0.3);border-radius:10px;padding:12px;text-align:center">
        <div style="font-size:10px;color:var(--purple);text-transform:uppercase;letter-spacing:1px;font-weight:700">Students in Vacant</div>
        <div style="font-size:26px;font-weight:900;color:var(--purple)">${vacRooms.reduce((s,r)=>s+getRoomOccupancy(r),0)}</div>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Room</th><th>Type</th><th>Floor</th><th>Occupied</th><th>Available Seats</th><th>Rent</th><th>Current Residents</th><th></th></tr></thead>
        <tbody>${rows||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:24px">No vacant seats available</td></tr>'}</tbody>
      </table>
    </div>`);
}

// ════════════════════════════════════════════════════════════════════════════
// MONTH DETAIL MODAL — editable, updatable, exportable
// ════════════════════════════════════════════════════════════════════════════
function showMonthDetailModal(monthKey, monthLabel) {
  renderMonthModal(monthKey, monthLabel);
}

function renderMonthModal(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  const paidPays = DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,monthKey));
  const pendPays = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,monthKey));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(monthKey));
  const rev = calcRevenue(monthKey);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0);
  const pendTotal = pendPays.reduce((s,p)=>s+Number(p.amount),0);
  const netProfit = rev - expTotal;
  // Active students (those registered and active with a room this month)
  // Show Active students + students who joined this month regardless of current status (historical view)
  const activeStudents = DB.students.filter(s=>s.status==='Active'||(s.joinDate?.startsWith(monthKey)&&DB.payments.some(p=>p.studentId===s.id&&_payMatchesMonth(p,monthKey))));

  const studentRows = activeStudents.map(s=>{
    const room = DB.rooms.find(r=>r.id===s.roomId);
    const sPays = DB.payments.filter(p=>p.studentId===s.id&&_payMatchesMonth(p,monthKey));
    const sPaid = sPays.filter(p=>p.status==='Paid').reduce((t,p)=>t+Number(p.amount),0);
    const sPend = sPays.filter(p=>p.status==='Pending').reduce((t,p)=>t+Number(p.amount),0);
    return `<tr>
      <td><span style="font-weight:700;color:var(--blue)">${escHtml(s.name)}</span><div style="font-size:11px;color:var(--text3)">${escHtml(s.phone||'')}</div></td>
      <td style="font-weight:700;color:var(--gold2)">#${room?room.number:'—'}</td>
      <td style="color:var(--text3);font-size:12px">${fmtPKR(s.rent)}/mo</td>
      <td style="color:var(--green);font-weight:700">${sPaid>0?fmtPKR(sPaid):'—'}</td>
      <td style="color:${sPend>0?'var(--amber)':'var(--text3)'};font-weight:${sPend>0?'700':'400'}">${sPend>0?fmtPKR(sPend):'—'}</td>
      <td>${statusBadge(s.status)}</td>
    </tr>`;
  }).join('');

  const feeRows = pays.map(p=>`<tr id="fee-row-${p.id}">
    <td><span style="color:var(--blue);font-weight:600">${escHtml(p.studentName||'—')}</span></td>
    <td style="color:var(--gold2);font-weight:700">#${escHtml(String(p.roomNumber||'—'))}</td>
    <td class="text-muted">${escHtml(p.month||'—')}</td>
    <td>
      <span class="editable-cell" onclick="editMonthFeeField('${p.id}','amount',this)" title="Click to edit">${fmtPKR(p.amount)}</span>
    </td>
    <td>${pmBadge(p.method)}</td>
    <td>
      <select onchange="updateMonthPayStatus('${p.id}',this.value)" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:3px 8px;font-size:12px;cursor:pointer">
        <option value="Paid" ${p.status==='Paid'?'selected':''}>✅ Paid</option>
        <option value="Pending" ${p.status==='Pending'?'selected':''}>⏳ Pending</option>
      </select>
    </td>
    <td class="text-muted" style="font-size:12px">
      <span class="editable-cell" onclick="editMonthFeeField('${p.id}','date',this)" title="Click to edit">${fmtDate(p.date)||'—'}</span>
    </td>
    <td>
      <button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="deleteMonthPayment('${p.id}','${monthKey}','${escHtml(monthLabel)}')">🗑</button>
    </td>
  </tr>`).join('');

  const expRows = exps.map(e=>`<tr id="exp-row-${e.id}">
    <td class="text-muted" style="font-size:12px">
      <span class="editable-cell" onclick="editMonthExpField('${e.id}','date',this)" title="Click to edit">${fmtDate(e.date)||'—'}</span>
    </td>
    <td>
      <span class="editable-cell" onclick="editMonthExpField('${e.id}','category',this)" title="Click to edit">${escHtml(e.category||'—')}</span>
    </td>
    <td>
      <span class="editable-cell" onclick="editMonthExpField('${e.id}','description',this)" title="Click to edit">${escHtml(e.description||'—')}</span>
    </td>
    <td>
      <span class="editable-cell" style="color:var(--red);font-weight:700" onclick="editMonthExpField('${e.id}','amount',this)" title="Click to edit">${fmtPKR(e.amount)}</span>
    </td>
    <td>
      <button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="deleteMonthExpense('${e.id}','${monthKey}','${escHtml(monthLabel)}')">🗑</button>
    </td>
  </tr>`).join('');

  showModal('modal-xl', `📅 ${monthLabel} — Full Monthly Report`,
  `<!-- KPI Summary -->
  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
    <div style="background:var(--green-dim);border:1px solid rgba(46,201,138,0.3);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--green);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">💰 Total Revenue</div>
      <div style="font-size:22px;font-weight:900;color:var(--green)">${fmtPKR(rev)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${paidPays.length} payments</div>
    </div>
    <div style="background:var(--red-dim);border:1px solid rgba(224,82,82,0.3);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--red);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">📉 Expenses</div>
      <div style="font-size:22px;font-weight:900;color:var(--red)">${fmtPKR(expTotal)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${exps.length} records</div>
    </div>
    <div style="background:${netProfit>=0?'var(--green-dim)':'var(--red-dim)'};border:1px solid ${netProfit>=0?'rgba(46,201,138,0.3)':'rgba(224,82,82,0.3)'};border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:${netProfit>=0?'var(--green)':'var(--red)'};text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">📊 Available Fund</div>
      <div style="font-size:22px;font-weight:900;color:${netProfit>=0?'var(--green)':'var(--red)'}">${fmtPKR(netProfit)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">Rev − Exp</div>
    </div>
    <div style="background:var(--amber-dim);border:1px solid rgba(240,160,48,0.3);border-radius:10px;padding:14px;text-align:center">
      <div style="font-size:9px;color:var(--amber);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-bottom:4px">⏳ Pending</div>
      <div style="font-size:22px;font-weight:900;color:var(--amber)">${fmtPKR(pendTotal)}</div>
      <div style="font-size:10px;color:var(--text3);margin-top:3px">${pendPays.length} unpaid</div>
    </div>
  </div>

  <!-- TAB NAVIGATION -->
  <div style="display:flex;gap:4px;margin-bottom:16px;background:var(--bg3);padding:4px;border-radius:10px">
    <button onclick="switchMonthTab('students')" id="mtab-students" class="btn btn-sm" style="flex:1;border-radius:7px;background:var(--gold-dim);color:var(--gold2);border:1px solid rgba(200,168,75,0.3)">🧑‍🎓 Students (${activeStudents.length})</button>
    <button onclick="switchMonthTab('fees')" id="mtab-fees" class="btn btn-sm" style="flex:1;border-radius:7px;background:transparent;color:var(--text3);border:none">💳 Fee Records (${pays.length})</button>
    <button onclick="switchMonthTab('expenses')" id="mtab-expenses" class="btn btn-sm" style="flex:1;border-radius:7px;background:transparent;color:var(--text3);border:none">📉 Expenses (${exps.length})</button>
  </div>

  <!-- STUDENTS TAB -->
  <div id="mpanel-students">
    <div class="table-wrap">
      <table><thead><tr><th>Student</th><th>Room</th><th>Monthly Rent</th><th>Paid</th><th>Pending</th><th>Status</th></tr></thead>
      <tbody>${studentRows||'<tr><td colspan="6" style="text-align:center;color:var(--text3);padding:16px">No students found</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- FEES TAB -->
  <div id="mpanel-fees" style="display:none">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="addMonthPaymentFromModal('${monthKey}','${escHtml(monthLabel)}')">+ Add Fee Record</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount ✏️</th><th>Method</th><th>Status</th><th>Date ✏️</th><th></th></tr></thead>
      <tbody id="fee-tbody">${feeRows||'<tr><td colspan="8" style="text-align:center;color:var(--text3);padding:16px">No fee records</td></tr>'}</tbody>
      </table>
    </div>
  </div>

  <!-- EXPENSES TAB -->
  <div id="mpanel-expenses" style="display:none">
    <div style="display:flex;justify-content:flex-end;margin-bottom:8px">
      <button class="btn btn-primary btn-sm" onclick="addMonthExpenseFromModal('${monthKey}','${escHtml(monthLabel)}')">+ Add Expense</button>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Date ✏️</th><th>Category ✏️</th><th>Description ✏️</th><th>Amount ✏️</th><th></th></tr></thead>
      <tbody id="exp-tbody">${expRows||'<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:16px">No expense records</td></tr>'}</tbody>
      </table>
    </div>
  </div>`,
  `<button class="btn btn-secondary" onclick="exportMonthCSV('${monthKey}','${escHtml(monthLabel)}')">📥 Export CSV</button>
   <button class="btn btn-secondary" onclick="printMonthReport('${monthKey}','${escHtml(monthLabel)}')">🖨️ Print Report</button>
   <button class="btn btn-primary" onclick="closeModal()">✓ Done</button>`
  );
}

function switchMonthTab(tab) {
  ['students','fees','expenses'].forEach(t=>{
    const panel=document.getElementById('mpanel-'+t);
    const btn=document.getElementById('mtab-'+t);
    if(!panel||!btn) return;
    const active = t===tab;
    panel.style.display=active?'block':'none';
    if(active){btn.style.background='var(--gold-dim)';btn.style.color='var(--gold2)';btn.style.border='1px solid rgba(200,168,75,0.3)';}
    else{btn.style.background='transparent';btn.style.color='var(--text3)';btn.style.border='none';}
  });
}

async function editMonthFeeField(payId, field, cell) {
  const pay = DB.payments.find(p=>p.id===payId);
  if(!pay) return;
  const old = field==='amount'?pay.amount:pay[field];
  const inp = document.createElement('input');
  inp.type = field==='date'?'date':'text';
  inp.value = old||'';
  inp.className='editing-cell';
  inp.style.width='120px';
  cell.replaceWith(inp);
  inp.focus();
  const save = async ()=>{
    const newVal = inp.value.trim();
    if(field==='amount') pay.amount=Number(newVal)||pay.amount;
    else pay[field]=newVal;
    await saveDB();
    const span=document.createElement('span');
    span.className='editable-cell';
    span.title='Click to edit';
    span.onclick=()=>editMonthFeeField(payId,field,span);
    span.textContent = field==='amount'?fmtPKR(pay.amount):(field==='date'?fmtDate(pay[field]):pay[field]);
    if(field==='amount'){span.style.color='var(--green)';span.style.fontWeight='700';}
    inp.replaceWith(span);
    toast('Updated successfully','success');
  };
  inp.onblur=save;
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape')inp.blur();};
}

function editMonthExpField(expId, field, cell) {
  const exp = DB.expenses.find(e=>e.id===expId);
  if(!exp) return;
  const old = field==='amount'?exp.amount:exp[field];
  const inp = document.createElement('input');
  inp.type = field==='date'?'date':'text';
  inp.value = old||'';
  inp.className='editing-cell';
  inp.style.width = field==='description'?'200px':'120px';
  cell.replaceWith(inp);
  inp.focus();
  const save = async ()=>{
    const newVal = inp.value.trim();
    if(field==='amount') exp.amount=Number(newVal)||exp.amount;
    else exp[field]=newVal;
    await saveDB();
    const span=document.createElement('span');
    span.className='editable-cell';
    span.title='Click to edit';
    span.onclick=()=>editMonthExpField(expId,field,span);
    span.textContent = field==='amount'?fmtPKR(exp.amount):(field==='date'?fmtDate(exp[field]):exp[field]);
    if(field==='amount'){span.style.color='var(--red)';span.style.fontWeight='700';}
    inp.replaceWith(span);
    toast('Updated successfully','success');
  };
  inp.onblur=save;
  inp.onkeydown=e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape')inp.blur();};
}

async function updateMonthPayStatus(payId, newStatus) {
  const pay = DB.payments.find(p=>p.id===payId);
  if(!pay) return;
  pay.status = newStatus;
  if(newStatus==='Paid' && !pay.paidDate) pay.paidDate = today();
  if(newStatus==='Pending') pay.paidDate='';
  await saveDB();
  toast('Payment status updated to '+newStatus,'success');
}

async function deleteMonthPayment(payId, monthKey, monthLabel) {
  showConfirm('Delete Fee Record','Remove this fee record? This cannot be undone.',async ()=>{
    DB.payments = DB.payments.filter(p=>p.id!==payId);
    await saveDB();
    toast('Fee record deleted','success');
    renderMonthModal(monthKey, monthLabel);
  });
}

async function deleteMonthExpense(expId, monthKey, monthLabel) {
  showConfirm('Delete Expense','Remove this expense record? This cannot be undone.',async ()=>{
    DB.expenses = DB.expenses.filter(e=>e.id!==expId);
    await saveDB();
    toast('Expense deleted','success');
    renderMonthModal(monthKey, monthLabel);
  });
}

function addMonthPaymentFromModal(monthKey, monthLabel) {
  closeModal();
  showAddPaymentModal();
}

function addMonthExpenseFromModal(monthKey, monthLabel) {
  closeModal();
  showAddExpenseModal();
}

function exportMonthCSV(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(monthKey));
  const rev = calcRevenue(monthKey);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0);
  let csv = `${DB.settings.hostelName} | ${monthLabel} Report\n\n`;
  csv += `Summary\nTotal Revenue,${rev}\nExpenses,${expTotal}\nAvailable Fund,${rev-expTotal}\nPending,${pays.filter(p=>p.status==='Pending').reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0)}\n\n`;
  csv += `Fee Records\nStudent,Room,Month,Amount,Method,Status,Date\n`;
  pays.forEach(p=>{ csv += [csvEsc(p.studentName),csvEsc(p.roomNumber),csvEsc(p.month),Number(p.amount),csvEsc(p.method),csvEsc(p.status),csvEsc(p.date||p.dueDate||'')].join(',')+"\n"; });
  csv += `\nExpenses\nDate,Category,Description,Amount\n`;
  exps.forEach(e=>{ csv += [csvEsc(e.date),csvEsc(e.category),csvEsc(e.description),Number(e.amount)].join(',')+"\n"; });
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `Hostel_Report_${monthKey}.csv`;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500); // FIX 16: revoke blob URL to free memory
  toast('CSV exported successfully','success');
}

function printMonthReport(monthKey, monthLabel) {
  const pays = DB.payments.filter(p=>_payMatchesMonth(p,monthKey));
  const exps = DB.expenses.filter(e=>e.date?.startsWith(monthKey));
  const rev = calcRevenue(monthKey);
  const expTotal = exps.reduce((s,e)=>s+Number(e.amount),0);
  const pend = DB.payments.filter(p=>p.status==='Pending'&&_payMatchesMonth(p,monthKey)).reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount)),0);
  const activeStudents = DB.students.filter(s=>s.status==='Active');
  const _mRptHtml = `<!DOCTYPE html><html><head><title>${monthLabel} Report</title>
  <style>
    body{font-family:Arial,sans-serif;padding:24px;color:#1e293b;font-size:13px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-bottom:12px;border-bottom:2px solid #c8a84b}
    .title{font-size:20px;font-weight:900;color:#1e293b}.subtitle{font-size:12px;color:#64748b;margin-top:3px}
    .badge{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:700;background:#c8a84b22;color:#8b6a00;border:1px solid #c8a84b55}
    .kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:20px}
    .kpi{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;text-align:center}
    .kpi label{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:6px}
    .kpi .val{font-size:20px;font-weight:900;color:#1e293b}
    .section{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:16px;margin-bottom:16px}
    .section h3{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#f1f5f9;padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#64748b;font-weight:700;border-bottom:1px solid #e2e8f0}
    td{padding:8px 12px;border-bottom:1px solid #f8fafc}
    .green{color:#16a34a;font-weight:700}.red{color:#dc2626;font-weight:700}.gold{color:#854d0e;font-weight:700}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
    @media print{body{padding:16px}}
  </style></head><body>
  <div class="header">
    <div><div class="title">${DB.settings.hostelName}</div><div class="subtitle">${monthLabel} Report · Generated ${new Date().toLocaleDateString()}</div></div>
    <div class="badge">Monthly Report</div>
  </div>
  <div class="kpi-grid">
    <div class="kpi"><label>Total Revenue</label><div class="val green">${fmtPKR(rev)}</div></div>
    <div class="kpi"><label>Expenses</label><div class="val red">${fmtPKR(expTotal)}</div></div>
    <div class="kpi"><label>Available Fund</label><div class="val" style="color:${rev-expTotal>=0?'#16a34a':'#dc2626'}">${fmtPKR(rev-expTotal)}</div></div>
    <div class="kpi"><label>Pending</label><div class="val gold">${fmtPKR(pend)}</div></div>
  </div>
  <div class="section"><h3>🧑‍🎓 Active Students (${activeStudents.length})</h3>
    <table><thead><tr><th>Name</th><th>Room</th><th>Rent</th><th>Phone</th><th>Status</th></tr></thead><tbody>
    ${activeStudents.map(s=>{const rm=DB.rooms.find(r=>r.id===s.roomId);return `<tr><td>${escHtml(s.name)}</td><td class="gold">#${rm?rm.number:'—'}</td><td>${fmtPKR(s.rent)}</td><td>${escHtml(s.phone||'')}</td><td>${s.status}</td></tr>`;}).join('')||'<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:12px">No students</td></tr>'}
    </tbody></table>
  </div>
  <div class="section"><h3>💳 Fee Records</h3>
    <table><thead><tr><th>Student</th><th>Room</th><th>Month</th><th>Amount</th><th>Method</th><th>Status</th><th>Date</th></tr></thead><tbody>
    ${pays.map(p=>`<tr><td>${escHtml(p.studentName||'—')}</td><td class="gold">#${p.roomNumber||'—'}</td><td>${escHtml(p.month||'—')}</td><td class="${p.status==='Paid'?'green':'red'}">${fmtPKR(p.amount)}</td><td>${escHtml(p.method||'—')}</td><td class="${p.status==='Paid'?'green':'red'}">${p.status}</td><td>${fmtDate(p.date)||'—'}</td></tr>`).join('')||'<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:12px">No records</td></tr>'}
    </tbody></table>
  </div>
  <div class="section"><h3>📉 Expenses</h3>
    <table><thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th></tr></thead><tbody>
    ${exps.map(e=>`<tr><td>${fmtDate(e.date)}</td><td>${escHtml(e.category||'—')}</td><td>${escHtml(e.description||'—')}</td><td class="red">${fmtPKR(e.amount)}</td></tr>`).join('')||'<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:12px">No expenses</td></tr>'}
    </tbody></table>
  </div>
  <div class="footer">Generated ${new Date().toLocaleDateString()} · ${DB.settings.hostelName} · Confidential</div>
  </body></html>`;
  _electronPDF(_mRptHtml, (DB.settings.hostelName||'Report').replace(/\s+/g,'-').replace(/[^a-zA-Z0-9\-]/g,'')+'_'+monthLabel.replace(/\s+/g,'-')+'.pdf', {pageSize:'A4'});
}

// ════════════════════════════════════════════════════════════════════════════
// CANCELLATIONS
// ════════════════════════════════════════════════════════════════════════════

// ── TREND CHART DRAWING (stock-market style) ─────────────────────────────────
// ── TREND CHART (Chart.js — Jan–Dec, revenue line + hover tooltip) ───────────
var _dashTrendChart = null;
setTimeout(function(){
  if(typeof Chart!=='undefined'&&typeof ChartDataLabels!=='undefined') Chart.register(ChartDataLabels);
},0);

function drawTrendChart() {
  var canvas = document.getElementById('trend-canvas');
  if (!canvas || typeof Chart === 'undefined') return;

  var MS2 = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var MN2 = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var now  = new Date();
  var yr   = now.getFullYear();
  var curKey = yr + '-' + String(now.getMonth()+1).padStart(2,'0');

  var months=[], revD=[], expD=[], trfD=[], pendD=[], real=[];
  for(var i=0;i<12;i++){
    var k = yr+'-'+String(i+1).padStart(2,'0');
    var isPast = k <= curKey;
    var rev = isPast ? calcRevenue(k) : 0;
    var exp = isPast ? (DB.expenses||[]).filter(e=>(e.date||'').startsWith(k)).reduce((s,e)=>s+Number(e.amount||0),0) : 0;
    var trf = isPast ? (DB.transfers||[]).filter(t=>(t.date||'').startsWith(k)).reduce((s,t)=>s+Number(t.amount||0),0) : 0;
    var pend= isPast ? (DB.payments||[]).filter(p=>p.status==='Pending'&&_payMatchesMonth(p,k)).reduce((s,p)=>s+(p.unpaid!=null?Number(p.unpaid):Number(p.amount||0)),0) : 0;
    months.push({label:MS2[i], full:MN2[i]+' '+yr, key:k});
    revD.push(isPast&&rev>0?rev:null);
    expD.push(isPast&&exp>0?exp:null);
    trfD.push(isPast&&trf>0?trf:null);
    pendD.push(isPast&&pend>0?pend:null);
    real.push(isPast&&rev>0);
  }

  var plotRev = revD.map(function(v){return v!==null?v:0;});
  var ptColors = plotRev.map(function(v,i){
    if(!real[i]) return 'rgba(0,230,118,0.15)';
    if(i===0) return '#00e676';
    var p=null; for(var j=i-1;j>=0;j--){if(real[j]){p=plotRev[j];break;}} return v>=(p||0)?'#00e676':'#ff4d6d';
  });
  var lblColors = plotRev.map(function(v,i){
    if(!real[i]) return 'rgba(255,255,255,0.1)';
    if(i===0) return '#00e676';
    return v>=(plotRev[i-1]||0)?'#00e676':'#ff4d6d';
  });

  var badge = document.getElementById('trend-hb');
  function showBadge(idx,x,y){
    var rev=revD[idx]||0, exp=expD[idx]||0, trf=trfD[idx]||0, pend=pendD[idx]||0, net=rev-exp-trf;
    var isR=real[idx];
    badge.innerHTML='<div style="font-size:12px;font-weight:700;color:#e8eef8;margin-bottom:8px">'+months[idx].full+'</div>'+(isR?[
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:#8a9ab8"><span style="width:7px;height:7px;border-radius:50%;background:#00e676;display:inline-block"></span>Revenue</span><span style="font-weight:700;color:#00e676">'+fmtPKR(rev)+'</span></div>',
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:#8a9ab8"><span style="width:7px;height:7px;border-radius:50%;background:#ff4d6d;display:inline-block"></span>Expenses</span><span style="font-weight:700;color:#ff4d6d">'+fmtPKR(exp)+'</span></div>',
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:#8a9ab8"><span style="width:7px;height:7px;border-radius:50%;background:#ff8c42;display:inline-block"></span>Transfers</span><span style="font-weight:700;color:#ff8c42">'+fmtPKR(trf)+'</span></div>',
      '<div style="display:flex;justify-content:space-between;margin-bottom:4px"><span style="display:flex;align-items:center;gap:5px;color:#8a9ab8"><span style="width:7px;height:7px;border-radius:50%;background:#f0c040;display:inline-block"></span>Pending</span><span style="font-weight:700;color:#f0c040">'+fmtPKR(pend)+'</span></div>',
      '<hr style="border:none;border-top:1px solid #2a3d52;margin:6px 0"/>',
      '<div style="display:flex;justify-content:space-between;font-weight:700"><span>Net</span><span style="color:'+(net>=0?'#00e676':'#ff4d6d')+'">'+(net>=0?'+':'−')+fmtPKR(net)+'</span></div>'
    ].join(''):'<div style="color:#4a6080;font-size:12px;text-align:center;padding:6px 0">No data yet</div>');
    var vw=window.innerWidth, vh=window.innerHeight;
    var left=x+16; if(left+230>vw) left=x-240;
    var top=y-80;  if(top<8) top=y+16; if(top+220>vh) top=vh-230;
    badge.style.left=left+'px'; badge.style.top=top+'px'; badge.style.display='block';
  }

  if(_dashTrendChart){_dashTrendChart.destroy();_dashTrendChart=null;}

  _dashTrendChart = new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{
      labels:months.map(function(m){return m.label;}),
      datasets:[{
        data:plotRev,
        borderColor:function(c){var g=c.chart.ctx.createLinearGradient(0,0,c.chart.width,0);g.addColorStop(0,'#00e676');g.addColorStop(1,'rgba(0,230,118,0.3)');return g;},
        borderWidth:2.5,
        pointBackgroundColor:ptColors, pointBorderColor:ptColors,
        pointRadius:function(c){return real[c.dataIndex]?6:3;}, pointHoverRadius:9,
        tension:0.35, fill:false,
        datalabels:{
          display:function(c){return real[c.dataIndex];},
          anchor:'end',align:'top',offset:6,
          color:function(c){return lblColors[c.dataIndex];},
          backgroundColor:'#0f1c2e', borderColor:function(c){return lblColors[c.dataIndex];},
          borderWidth:1, borderRadius:4, padding:{top:3,bottom:3,left:7,right:7},
          font:{size:10,weight:'700'},
          formatter:function(v,c){
            var i=c.dataIndex; if(!real[i])return'';
            var pv=null; for(var j=i-1;j>=0;j--){if(real[j]){pv=plotRev[j];break;}}
            if(pv===null)return'PKR '+v.toLocaleString();
            var p=(((v-pv)/pv)*100).toFixed(1);
            return'PKR '+v.toLocaleString()+'\n'+(parseFloat(p)>=0?'▲':'▼')+' '+Math.abs(p)+'%';
          }
        }
      }]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      layout:{padding:{top:50,right:10,left:4,bottom:0}},
      plugins:{legend:{display:false},tooltip:{enabled:false}},
      onHover:function(event,els){
        if(els.length>0){
          var cx=event.native?event.native.clientX:event.x;
          var cy=event.native?event.native.clientY:event.y;
          showBadge(els[0].index,cx,cy);
        } else { if(badge) badge.style.display='none'; }
      },
      scales:{
        x:{grid:{color:'rgba(255,255,255,0.03)'},border:{display:false},ticks:{color:'#4a6080',font:{size:11}}},
        y:{grid:{color:'rgba(255,255,255,0.03)'},border:{display:false},ticks:{color:'#4a6080',font:{size:11},callback:function(v){return v>=1e6?(v/1e6).toFixed(1)+'M':v>=1000?(v/1000).toFixed(0)+'k':v;}}}
      }
    }
  });
}
// ─────────────────────────────────────────────────────────────────────────────

function navigateToMonth(monthKey) {
  const realMonth = new Date().toISOString().slice(0,7);
  _dashboardMonth = (monthKey === realMonth) ? null : monthKey;
  const resetBtn = document.getElementById('sb-cal-reset-btn');
  if(resetBtn) resetBtn.style.display = _dashboardMonth ? 'inline-block' : 'none';
  if(currentPage === 'reports') {
    reportPeriod = 'month'; reportDetail = null; renderPage('reports');
  } else if(currentPage === 'dashboard') {
    renderPage('dashboard');
  } else {
    // Stay on whatever page the user is on — re-render it filtered to the new month
    renderPage(currentPage);
  }
  const d = new Date(monthKey+'-01');
  toast('Viewing → ' + d.toLocaleString('default',{month:'long',year:'numeric'}), 'info');
}

// Download detail panel as CSV
function downloadDetailCSV(type) {
  const key = reportPeriod==='month' ? thisMonth() : thisYear();
  let rows = [], filename = '';
  if (type === 'financial') {
    filename = 'Revenue_'+key+'.csv';
    rows.push(['Student','Room','Month','Amount Paid','Method','Date']);
    DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',p.amount,p.method||'—',p.date||'—']);
    });
  } else if (type === 'pending') {
    filename = 'Pending_Payments.csv';
    rows.push(['Student','Room','Month','Partial Paid','Outstanding','Method','Date']);
    DB.payments.filter(p=>p.status==='Pending').forEach(p=>{
      rows.push([p.studentName||'—','#'+(p.roomNumber||'—'),p.month||'—',
        p.unpaid!=null?p.amount:0, p.unpaid!=null?p.unpaid:p.amount,
        p.method||'—', p.date||'—']);
    });
  } else if (type === 'expenses') {
    filename = 'Expenses_'+key+'.csv';
    rows.push(['Date','Category','Description','Amount']);
    DB.expenses.filter(e=>(e.date||'').startsWith(key)).forEach(e=>{
      rows.push([e.date||'—',e.category||'—',e.description||'—',e.amount]);
    });
  } else if (type === 'transfers') {
    filename = 'Transfers.csv';
    rows.push(['Date','Description','Method','Amount','Received By','Notes']);
    (DB.transfers||[]).forEach(t=>{
      rows.push([t.date||'—',t.description||'—',t.method||'—',t.amount,t.receivedBy||'—',t.notes||'—']);
    });
  } else if (type === 'students') {
    filename = 'Students_'+(studentReportFilter==='All'?'All':studentReportFilter)+'.csv';
    rows.push(['Name','Father Name','Room','Phone','CNIC','Join Date','Rent','Status']);
    const list = studentReportFilter==='All' ? DB.students : DB.students.filter(t=>t.status===studentReportFilter);
    list.forEach(t=>{
      const r = DB.rooms.find(x=>x.id===t.roomId);
      rows.push([t.name||'—',t.fatherName||'—',r?'#'+r.number:'—',t.phone||'—',t.cnic||'—',t.joinDate||'—',t.rent,t.status||'—']);
    });
  } else if (type === 'netprofit') {
    filename = 'AvailableFund_'+key+'.csv';
    rows.push(['Date','Type','Description','Amount']);
    DB.payments.filter(p=>p.status==='Paid'&&_payMatchesMonth(p,key)).forEach(p=>{
      rows.push([p.date||'—','Income',p.studentName+' · '+p.month,p.amount]);
    });
    DB.expenses.filter(e=>(e.date||'').startsWith(key)).forEach(e=>{
      rows.push([e.date||'—','Expense',e.category+': '+e.description,'-'+e.amount]);
    });
  }
  if (!rows.length) { toast('No data to export','error'); return; }
  const csv = rows.map(r=>r.map(c=>'"'+String(c==null?'':c).replace(/"/g,'""')+'"').join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1500); // FIX 18: revoke blob URL to free memory
  toast('Downloaded: '+filename,'success');
}
let calPopoverOpen = false;
function calPopSelect(key, label) {
  document.getElementById('cal-popover-el')?.remove();
  calPopoverOpen=false;
  showMonthDetailModal(key, label);
}


// ════════════════════════════════════════════════════════════════════════════
async function checkAutoMonthAdvance() {
  if (DB.settings.autoMonthGenerate === false) return;
  const now = new Date();
  const currentMonthKey = now.toISOString().slice(0, 7);
  const lastGenKey = DB.settings.lastAutoGenMonth || null;
  if (lastGenKey === currentMonthKey) return;

  const startDate = lastGenKey ? new Date(lastGenKey + '-01') : new Date(now.getFullYear(), now.getMonth(), 1);
  if (lastGenKey) startDate.setMonth(startDate.getMonth() + 1);

  let totalAdded = 0;
  let monthsGenerated = [];

  while (startDate <= now) {
    const mo = startDate.toLocaleString('default', { month: 'long', year: 'numeric' });
    const active = DB.students.filter(t => t.status === 'Active');
    let added = 0;
    active.forEach(t => {
      if (!DB.payments.some(p => p.studentId === t.id && p.month === mo)) {
        const room = DB.rooms.find(r => r.id === t.roomId);
        DB.payments.push({
          id: 'p_' + uid(), studentId: t.id, studentName: t.name,
          roomId: t.roomId, roomNumber: room?.number || '',
          amount: 0, monthlyRent: t.rent, totalRent: t.rent, unpaid: t.rent,
          method: t.paymentMethod || 'Cash', month: mo,
          date: startDate.toISOString().split('T')[0],
          dueDate: '', status: 'Pending',
          notes: 'Auto-generated', paidDate: ''
        });
        added++;
      }
    });
    if (added > 0) { totalAdded += added; monthsGenerated.push(mo); }
    startDate.setMonth(startDate.getMonth() + 1);
  }

  DB.settings.lastAutoGenMonth = currentMonthKey;
  await saveDB();

  if (totalAdded > 0) {
    const msg = monthsGenerated.length === 1
      ? '🗓️ Auto-generated ' + totalAdded + ' payment records for ' + monthsGenerated[0]
      : '🗓️ Auto-generated ' + totalAdded + ' payment records for ' + monthsGenerated.length + ' months';
    toast(msg, 'success');
  }
}

async function quickDashTransfer() {
  const amt = parseFloat(document.getElementById('dash-transfer-amt')?.value)||0;
  const method = document.getElementById('dash-transfer-method')?.value||'Cash';
  const recv = document.getElementById('dash-transfer-recv')?.value?.trim()||'';
  const desc = document.getElementById('dash-transfer-desc')?.value?.trim()||'Transfer to Owner';
  if(!amt||amt<=0){toast('Enter a valid amount','error');return;}
  if(!DB.transfers) DB.transfers=[];
  DB.transfers.push({id:'tr_'+uid(),amount:amt,method,receivedBy:recv,description:desc,date:today()});
  await saveDB();
  ['dash-transfer-amt','dash-transfer-recv','dash-transfer-desc'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  renderPage('dashboard');
  toast(`Transfer of ${fmtPKR(amt)} recorded!`,'success');
}

// Alias the old name for backward compat

// ── DASHBOARD GLOBAL SEARCHfunction dashGlobalSearch(query) {
  var clearBtn = document.getElementById('dash-search-clear');
  var resultsBox = document.getElementById('dash-search-results');
  if (!resultsBox) return;
  if (clearBtn) clearBtn.style.display = query.length > 0 ? 'inline-flex' : 'none';
  if (!query.trim()) { resultsBox.style.display = 'none'; return; }

  var q = query.trim().toLowerCase();
  var results = [];

  // Search students: name, father name, CNIC, phone, address, city
  DB.students.forEach(function(s) {
    var room = DB.rooms.find(function(r){ return r.id === s.roomId; });
    var roomLabel = room ? '#' + room.number : '—';
    var haystack = [s.id, s.name, s.fatherName, s.cnic, s.phone, s.emergencyContact, s.email, s.occupation, s.address, s.city, s.permanentAddress, roomLabel].filter(Boolean).join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: 'student', icon: '🧑‍🎓',
        title: s.name || '—',
        sub: 'ID: ' + s.id + ' · Room ' + roomLabel + (s.occupation ? ' · ' + s.occupation : '') + (s.phone ? ' · ' + s.phone : ''),
        badge: statusBadge(s.status || 'Active'),
        action: "showViewStudentModal('" + s.id + "')"
      });
    }
  });

  // Search rooms: number, type, floor, amenities
  DB.rooms.forEach(function(r) {
    var type = getRoomType(r);
    var occ = getRoomOccupancy(r);
    var haystack = ['room', r.number, type ? type.name : '', r.floor, (r.amenities || []).join(' ')].join(' ').toLowerCase();
    if (haystack.includes(q)) {
      results.push({
        type: 'room', icon: '🛏️',
        title: 'Room #' + r.number,
        sub: (type ? type.name : '') + ' · ' + r.floor + ' Floor · ' + occ + '/' + (type ? type.capacity : 1) + ' filled',
        badge: '<span class="badge ' + (occ >= (type ? type.capacity : 1) ? 'badge-green' : 'badge-gray') + '">' + (occ >= (type ? type.capacity : 1) ? 'Full' : 'Available') + '</span>',
        action: "showRoomDetail('" + r.id + "')"
      });
    }
  });

  // Search by city / address / location
  var locationHits = {};
  DB.students.forEach(function(s) {
    var fields = [s.city, s.address, s.permanentAddress].filter(Boolean);
    fields.forEach(function(f) {
      if (f.toLowerCase().includes(q)) {
        var key = f.toLowerCase();
        if (!locationHits[key]) locationHits[key] = {city: f, students: []};
        locationHits[key].students.push(s.name);
      }
    });
  });
  Object.keys(locationHits).slice(0, 4).forEach(function(k) {
    var hit = locationHits[k];
    results.push({
      type: 'location', icon: '📍',
      title: hit.city,
      sub: hit.students.slice(0, 3).join(', ') + (hit.students.length > 3 ? ' +' + (hit.students.length - 3) + ' more' : ''),
      badge: '<span class="badge badge-blue">' + hit.students.length + ' student' + (hit.students.length !== 1 ? 's' : '') + '</span>',
      action: "studentFilter.search='" + hit.city.replace(/'/g, "\\'") + "';navigate('students')"
    });
  });

  // Payments by student name
  var payHits = [];
  DB.payments.forEach(function(p) {
    if ((p.studentName || '').toLowerCase().includes(q)) {
      if (!payHits.find(function(x){ return x.studentId === p.studentId; })) {
        payHits.push(p);
      }
    }
  });
  payHits.slice(0, 3).forEach(function(p) {
    results.push({
      type: 'payment', icon: '💳',
      title: p.studentName || '—',
      sub: p.month + ' · ' + (p.status === 'Paid' ? '✓ Paid' : '⏳ Pending') + ' · ' + fmtPKR(p.amount),
      badge: statusBadge(p.status),
      action: "payFilter.search='" + (p.studentName||'').replace(/'/g, "\\'") + "';navigate('payments')"
    });
  });

  if (!results.length) {
    resultsBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px">No results for <strong style="color:var(--text)">"' + escHtml(query) + '"</strong></div>';
    resultsBox.style.display = 'block';
    // Position under the search input
    var inp = document.getElementById('dash-global-search');
    if (inp) { var r2 = inp.getBoundingClientRect(); resultsBox.style.left = r2.left + 'px'; }
    return;
  }

  var grouped = {student:[], room:[], location:[], payment:[]};
  var groupLabels = {student:'Students', room:'Rooms', location:'Locations / Addresses', payment:'Finance'};
  // Also group by course for course searches
  var courseSub = {};
  DB.students.forEach(function(s){
    if(s.occupation && s.occupation.toLowerCase().includes(q)){
      var k = s.occupation;
      if(!courseSub[k]) courseSub[k]={course:k,students:[]};
      courseSub[k].students.push(s.name);
    }
  });
  Object.keys(courseSub).slice(0,3).forEach(function(k){
    var hit=courseSub[k];
    grouped['student'].push({type:'student',icon:'🎓',title:hit.course,sub:hit.students.slice(0,4).join(', ')+(hit.students.length>4?' +'+(hit.students.length-4)+' more':''),badge:'<span class="badge badge-blue">'+hit.students.length+' student'+(hit.students.length!==1?'s':'')+'</span>',action:"studentFilter.search='"+hit.course.replace(/'/g,"\\'")+ "';navigate('students')"});
  });
  results.forEach(function(r){ if (grouped[r.type]) grouped[r.type].push(r); });

  var html = '';
  ['student','room','location','payment'].forEach(function(type) {
    var items = grouped[type];
    if (!items.length) return;
    html += '<div style="padding:8px 14px 4px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--text3);border-bottom:1px solid var(--border)">' + groupLabels[type] + ' <span style="color:var(--text2)">' + items.length + '</span></div>';
    items.slice(0, 5).forEach(function(item) {
      html += '<div onclick="' + item.action + ';document.getElementById(\'dash-global-search\').value=\'\';dashGlobalSearchClear()" style="display:flex;align-items:center;gap:12px;padding:10px 14px;cursor:pointer;border-bottom:1px solid var(--border);transition:background 0.12s" onmouseover="this.style.background=\'var(--bg3)\'" onmouseout="this.style.background=\'\'">';
      html += '<div style="width:32px;height:32px;border-radius:8px;background:var(--bg3);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0">' + item.icon + '</div>';
      html += '<div style="flex:1;min-width:0"><div style="font-size:13px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(item.title) + '</div>';
      html += '<div style="font-size:11px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px">' + escHtml(item.sub) + '</div></div>';
      html += '<div style="flex-shrink:0">' + item.badge + '</div></div>';
    });
  });

  resultsBox.innerHTML = html;
  resultsBox.style.display = 'block';
  // Align dropdown under the header search input
  var inp2 = document.getElementById('dash-global-search');
  if (inp2) { var r3 = inp2.getBoundingClientRect(); resultsBox.style.left = r3.left + 'px'; }
}

function dashGlobalSearchClear() {
  var resultsBox = document.getElementById('dash-search-results');
  var clearBtn = document.getElementById('dash-search-clear');
  if (resultsBox) resultsBox.style.display = 'none';
  if (clearBtn) clearBtn.style.display = 'none';
}

// Close search results when clicking outside
document.addEventListener('click', function(e) {
  var box = document.getElementById('dash-search-results');
  var input = document.getElementById('dash-global-search');
  if (box && input && !box.contains(e.target) && e.target !== input) {
    box.style.display = 'none';
  }
});// ════════════════════════════════════════════════════════════════════════════
// 6-MONTH DATA RETENTION
// ════════════════════════════════════════════════════════════════════════════