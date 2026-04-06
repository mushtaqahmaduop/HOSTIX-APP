/* ─── DAMAM HOSTEL — RECEIPT SYSTEM (PATCHED) ───────────────────────────────
   FIXES:
   FIX-R1  Receipt counter moved OUT of buildReceiptHTML().
           Counter now only increments when receipt is FINALIZED (PDF save or print),
           not every time the receipt modal is previewed. This prevents counter gaps.
   FIX-R2  `var payId = payId` redeclaration fixed — use `resolvedPayId` instead.
   FIX-R3  _returnStudentId now cleared when modal is closed via X (not just Back btn).
   FIX-R4  buildReceiptHTML() accepts pre-assigned receiptNo as optional parameter
           so the same number is reused across preview/print/PDF of the same receipt.
   FIX-R5  receiptNo stored on the payment record (p.receiptNo) so reprinting
           the same receipt always shows the same number.
   FIX-R6  doPrintReceipt() uses Blob URL instead of deprecated document.write().
   ─────────────────────────────────────────────────────────────────────────── */

// [FIX-R3] Tracks which student modal to return to — cleared on ALL close paths
var _returnStudentId = null;

function _clearReturnStudentId() {
  _returnStudentId = null;
}

// ── OPEN RECEIPT FROM STUDENT VIEW ───────────────────────────────────────────
function printReceiptFromStudentView(payId, studentId) {
  _returnStudentId = studentId;
  printReceipt(payId);
}

// ── [FIX-R1 + FIX-R5] Assign receipt number ──────────────────────────────────
// Only called when receipt is FINALIZED (print or PDF save).
// If payment already has a receiptNo, reuse it (reprinting same receipt).
function _assignReceiptNo(payId) {
  const p = DB.payments.find(function(x){ return x.id === payId; });
  if (!p) return 'RCP-??????';

  // [FIX-R5] Reuse existing receipt number on reprint
  if (p.receiptNo) return p.receiptNo;

  // Assign new sequential number
  try {
    if (typeof DB !== 'undefined' && DB.settings) {
      DB.settings.receiptCounter = (DB.settings.receiptCounter || 0) + 1;
      const rno = 'RCP-' + String(DB.settings.receiptCounter).padStart(6, '0');
      p.receiptNo = rno; // [FIX-R5] persist on payment record
      if (typeof saveDB === 'function') saveDB();
      return rno;
    }
  } catch(e) {}
  return 'RCP-' + payId.slice(-6).toUpperCase();
}

// ── [FIX-R1 + FIX-R4] BUILD THE RECEIPT HTML STRING ─────────────────────────
// receiptNo is now passed in (or uses p.receiptNo if already assigned).
// Does NOT increment the counter — that happens in _assignReceiptNo().
function buildReceiptHTML(payId) {
  var p = DB.payments.find(function(x){ return x.id === payId; });
  if (!p) return null;

  var student   = DB.students.find(function(s){ return s.id === p.studentId; });
  var room      = DB.rooms.find(function(r){ return r.id === p.roomId; });
  var hostel    = (DB.settings.hostelName  || 'DAMAM Boys Hostel').toUpperCase();
  var phone     = DB.settings.phone        || '';
  var email     = DB.settings.email        || '';
  var location  = DB.settings.location     || '';
  var logoData  = localStorage.getItem('hostel_logo_' + (_ACTIVE_HOSTEL || 'hostel_1')) || '';

  var now2      = new Date().toLocaleDateString('en-PK', { day:'2-digit', month:'long', year:'numeric' });
  var nowTime   = new Date().toLocaleTimeString('en-PK', { hour:'2-digit', minute:'2-digit', hour12:true });

  // [FIX-R1] Use EXISTING receiptNo if already assigned, otherwise show placeholder.
  // Counter is only assigned on finalize — NOT here.
  var receiptNo = p.receiptNo || 'PREVIEW';

  var studentId  = (student && student.id) ? student.id.slice(-8).toUpperCase() : receiptNo;
  var wardenName = (typeof CUR_USER !== 'undefined' && CUR_USER && CUR_USER.name)
    ? CUR_USER.name : 'Authorized Warden';

  // ── Helpers ────────────────────────────────────────────────────────────────
  function dotRow(label, value, bold) {
    var w  = bold ? '900' : '800';
    var sz = bold ? '15px' : '13px';
    return '<div style="display:flex;align-items:baseline;font-family:\'Courier New\',Courier,monospace;'
      + 'font-size:' + sz + ';font-weight:' + w + ';color:#000;margin:6px 0">'
      + '<span style="white-space:nowrap;color:#111;font-weight:' + (bold?'900':'800') + '">' + label + '</span>'
      + '<span style="flex:1;overflow:hidden;letter-spacing:2px;margin:0 4px;color:#aaa">................................................................................................................................................................</span>'
      + '<span style="white-space:nowrap;font-weight:900;color:#000">' + value + '</span>'
      + '</div>';
  }
  function sep(style) {
    return '<div style="border-top:1.5px ' + (style||'dashed') + ' #888;margin:8px 0"></div>';
  }
  function secLabel(txt) {
    return '<div style="font-family:\'Courier New\',Courier,monospace;font-size:12px;letter-spacing:2px;'
      + 'text-transform:uppercase;color:#000;font-weight:900;margin:10px 0 6px;'
      + 'border-left:4px solid #222;padding-left:8px">' + txt + '</div>';
  }

  // ── Receipt wrapper ────────────────────────────────────────────────────────
  var html = '<div id="rc-print" data-pay-id="' + escHtml(payId) + '" style="background:#fafaf8;color:#111;font-family:\'Courier New\',Courier,monospace;'
    + 'max-width:360px;margin:0 auto;border-radius:4px;overflow:hidden;'
    + 'box-shadow:0 4px 24px rgba(0,0,0,0.18);border:1px solid #e0e0e0">';

  html += '<div style="height:12px;background:#fafaf8;border-bottom:2px dashed #bbb;position:relative">'
    + '<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent 8px,'
    + 'rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px)"></div>'
    + '</div>';

  html += '<div style="padding:16px 22px 12px;text-align:center">';
  html += '<div style="font-size:8px;letter-spacing:4px;color:#555;font-weight:800;margin-bottom:8px">* * * PAYMENT RECEIPT * * *</div>';
  if (logoData) {
    html += '<div style="margin:0 auto 8px;width:54px;height:54px;border-radius:12px;overflow:hidden;border:1.5px solid #ccc">'
      + '<img src="' + logoData + '" style="width:100%;height:100%;object-fit:cover">'
      + '</div>';
  }
  html += '<div style="font-size:18px;font-weight:900;letter-spacing:1.5px;line-height:1.2;color:#000">' + escHtml(hostel) + '</div>';
  if (location) html += '<div style="font-size:9.5px;color:#333;font-weight:700;margin-top:4px;letter-spacing:0.5px">' + escHtml(location) + '</div>';
  if (phone)    html += '<div style="font-size:9px;color:#555;font-weight:700;margin-top:2px">📞 ' + escHtml(phone) + '</div>';
  if (email)    html += '<div style="font-size:9px;color:#555;font-weight:700;margin-top:1px">✉ ' + escHtml(email) + '</div>';

  html += sep();
  html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:11px;color:#000;font-weight:900">';
  html += '<span style="letter-spacing:1px">STU-' + studentId + '</span>';
  html += '<span>' + now2 + ' ' + nowTime + '</span>';
  html += '</div>';
  html += '<div style="font-size:9.5px;color:#555;font-weight:700;margin-top:3px;text-align:right">Receipt #: ' + escHtml(receiptNo) + '</div>';
  html += '</div>';

  html += sep('solid');

  html += '<div style="padding:4px 22px 8px">';
  html += secLabel('Student Details');
  html += dotRow('Name',      escHtml(p.studentName || '—'));
  html += dotRow('Room No',   '#' + (room ? room.number : '—'));
  html += dotRow('Month',     escHtml(p.month || '—'));
  html += dotRow('Phone',     escHtml((student && student.phone) || '—'));
  html += dotRow('Admission', fmtDate(student && student.joinDate) || '—');
  html += '</div>';

  html += sep();

  var rcptAdmFee   = Number(p.admissionFee || p.fee || 0);
  var rcptExtra    = (p.extraCharges && p.extraCharges.length)
    ? p.extraCharges.reduce(function(s, c){ return s + Number(c.amount||0); }, 0) : 0;
  var rcptDiscount = Number(p.concession || p.discount || 0);
  var rcptConcDesc = (p.concessionDesc || p.discountDesc || '').trim();
  var rcptMonthly  = Number(p.monthlyRent || p.totalRent || 0)
    || (rcptDiscount > 0 || rcptAdmFee > 0 || rcptExtra > 0 ? 0 : Number(p.amount || 0));
  var rcptTotalDue = Math.max(0, rcptMonthly + rcptAdmFee + rcptExtra - rcptDiscount);

  html += '<div style="padding:4px 22px 10px">';
  html += secLabel('Fee Breakdown');
  html += dotRow('Monthly Rent', fmtPKR(rcptMonthly));
  if (rcptAdmFee > 0) html += dotRow('Admission Fee', fmtPKR(rcptAdmFee));
  if (p.extraCharges && p.extraCharges.length) {
    p.extraCharges.forEach(function(ch) {
      var chLabel = escHtml(ch.label || 'Extra');
      var chDesc  = escHtml(ch.description || ch.desc || '');
      var chTitle = (chDesc && chDesc !== chLabel) ? chLabel + ' (' + chDesc + ')' : chLabel;
      html += dotRow(chTitle, fmtPKR(ch.amount));
    });
  }
  if (rcptDiscount > 0)
    html += dotRow('Concession' + (rcptConcDesc ? ' (' + escHtml(rcptConcDesc) + ')' : ''), '− ' + fmtPKR(rcptDiscount));
  if (rcptAdmFee > 0 || rcptExtra > 0 || rcptDiscount > 0) {
    html += sep('dashed');
    html += dotRow('TOTAL DUE', fmtPKR(rcptTotalDue), true);
  }
  html += sep('dashed');
  html += dotRow('AMOUNT PAID', fmtPKR(p.amount), true);
  if (Number(p.unpaid || 0) > 0) {
    html += dotRow('REMAINING', fmtPKR(p.unpaid), true);
    html += '<div style="font-family:monospace;font-size:9px;font-weight:900;color:#c00;'
      + 'letter-spacing:1.5px;text-align:right;margin-top:2px">** PENDING BALANCE **</div>';
  }
  html += dotRow('Method', escHtml(p.method || 'Cash'));
  html += dotRow('Status', p.status === 'Paid' ? '✅ PAID' : '⏳ PENDING');
  html += '</div>';

  var history   = (p.partialPayments && p.partialPayments.length) ? p.partialPayments : [];
  var initEntry = {
    date: p.date || p.dueDate || '',
    amount: p.amount - history.reduce(function(s, x){ return s + Number(x.amount); }, 0),
    method: p.method || 'Cash',
    collectedBy: p.collectedBy || 'Warden',
    note: 'Initial payment'
  };
  var allHistory = initEntry.amount > 0 ? [initEntry].concat(history) : history;
  if (allHistory.length) {
    html += sep();
    html += '<div style="padding:4px 22px 10px">';
    html += secLabel('Payment History');
    allHistory.forEach(function(h, idx) {
      html += '<div style="font-family:monospace;font-size:11px;color:#000;margin:5px 0;border-left:3px solid #333;padding-left:8px">';
      html += '<div style="display:flex;justify-content:space-between;font-weight:800">';
      html += '<span>#' + (idx+1) + ' ' + escHtml(h.note || 'Payment') + '</span>';
      html += '<span>' + fmtPKR(h.amount) + '</span>';
      html += '</div>';
      html += '<div style="font-size:9.5px;color:#444;margin-top:2px">';
      html += (fmtDate(h.date) || '—') + ' · ' + escHtml(h.method || 'Cash') + ' · by ' + escHtml(h.collectedBy || 'Warden');
      html += '</div></div>';
    });
    html += '</div>';
  }

  html += sep('dashed');

  html += '<div style="padding:8px 22px 6px">';
  html += '<div style="display:flex;justify-content:space-between;font-family:monospace;font-size:10px;color:#333">';
  html += '<div style="text-align:center"><div style="border-top:1px solid #666;padding-top:4px;margin-top:28px;min-width:110px">Student Signature</div></div>';
  html += '<div style="text-align:center"><div style="border-top:1px solid #666;padding-top:4px;margin-top:28px;min-width:110px">'
    + escHtml(wardenName) + '<br><span style="font-size:8px;color:#888">Authorized Warden</span></div></div>';
  html += '</div>';
  html += '</div>';

  html += sep('dashed');

  html += '<div style="padding:10px 22px 8px;text-align:center">';
  html += '<div style="font-size:12px;font-weight:900;letter-spacing:3px;margin-bottom:6px;color:#000">** THANK YOU **</div>';
  html += '<div style="font-size:9px;color:#888;font-family:monospace">This is a computer-generated receipt.</div>';
  html += '</div>';

  // ── Powered-by footer (uses client's hostel name + system name) ───────────
  var appName   = (typeof DB !== 'undefined' && DB.settings && DB.settings.appName) ? DB.settings.appName : 'HOSTIX';
  var hostelFtr = (typeof DB !== 'undefined' && DB.settings && DB.settings.hostelName) ? DB.settings.hostelName : '';
  var phoneFtr  = (typeof DB !== 'undefined' && DB.settings && DB.settings.phone)      ? DB.settings.phone      : '';
  html += '<div style="border-top:1px dashed #ccc;margin:0 22px;padding:8px 0 6px;text-align:center">';
  if (hostelFtr) html += '<div style="font-size:9px;color:#555;font-family:monospace;font-weight:700">' + escHtml(hostelFtr) + '</div>';
  if (phoneFtr)  html += '<div style="font-size:8px;color:#888;font-family:monospace;margin-top:1px">📞 ' + escHtml(phoneFtr) + '</div>';
  html += '<div style="font-size:7.5px;color:#bbb;font-family:monospace;margin-top:3px;letter-spacing:0.5px">Powered by ' + escHtml(appName) + ' · Hostel Management System</div>';
  html += '</div>';

  html += '<div style="height:12px;background:#fafaf8;border-top:2px dashed #bbb;position:relative">'
    + '<div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0,transparent 8px,'
    + 'rgba(0,0,0,0.04) 8px,rgba(0,0,0,0.04) 9px)"></div>'
    + '</div>';

  html += '</div>';

  return html;
}

// ── MAIN RECEIPT ENTRY POINT ──────────────────────────────────────────────────
function printReceipt(payId) {
  var html = buildReceiptHTML(payId);
  if (!html) return;

  // [FIX-R3] Pass _clearReturnStudentId to close handlers
  var backBtn = _returnStudentId
    ? '<button class="btn btn-secondary" onclick="var s=_returnStudentId;_clearReturnStudentId();showViewStudentModal(s)">← Back to Student</button>'
    : '<button class="btn btn-secondary" onclick="_clearReturnStudentId();closeModal()">Close</button>';

  var _rcptFooter = backBtn
    + '<button class="btn btn-success" onclick="exportReceiptPDF(\'' + payId + '\')"><span style="font-size:13px">📄</span> Save PDF</button>'
    + '<button class="btn btn-primary" onclick="doPrintReceipt(\'' + payId + '\')"><span class="micon" style="font-size:15px">print</span> Print</button>';

  showModal('modal-md', '🧾 Receipt', html, _rcptFooter);
}

// ── [FIX-R6] PRINT RECEIPT — uses Blob URL instead of document.write() ────────
function doPrintReceipt(payId) {
  // [FIX-R1] Assign receipt number on finalize (print)
  if (payId) _assignReceiptNo(payId);

  var el = document.getElementById('rc-print');
  if (!el) return;

  // Refresh the receipt HTML with the now-assigned receipt number
  if (payId) {
    var fresh = buildReceiptHTML(payId);
    if (fresh) el.outerHTML = fresh;
    el = document.getElementById('rc-print');
    if (!el) return;
  }

  var printDateTime = new Date().toLocaleString('en-PK',{weekday:'short',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  var wardenName = (typeof CUR_USER!=='undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Authorized Warden';

  // [FIX-R6] Use Blob URL — no deprecated document.write()
  var fullHtml = '<!DOCTYPE html><html><head><title>Receipt</title>'
    + '<style>'
    + '@page { size: 80mm auto; margin: 4mm; }'
    + '@media print { .no-print { display:none !important; } body { background:#fff !important; } }'
    + '* { box-sizing:border-box; }'
    + 'html,body { margin:0; padding:8px 0; font-family:monospace; background:#f5f5f0; color:#111; }'
    + '#rc-print { max-width:340px; margin:0 auto; box-shadow:none !important; border:none !important; background:#fff !important; }'
    + '.print-meta { max-width:340px; margin:6px auto 0; font-size:9px; color:#888; text-align:center; font-family:monospace; }'
    + '.print-btn  { display:block; margin:14px auto 0; padding:10px 36px; background:#111; color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:700; cursor:pointer; font-family:sans-serif; }'
    + '</style>'
    + '</head><body>'
    + el.outerHTML
    + '<div class="print-meta">Printed: ' + printDateTime + ' · By: ' + escHtml(wardenName) + '</div>'
    + '<button class="print-btn no-print" onclick="window.print()">🖨️ Print Receipt</button>'
    + '<script>setTimeout(function(){ window.print(); }, 400);<\/script>'
    + '</body></html>';

  var blob = new Blob([fullHtml], { type: 'text/html' });
  var url  = URL.createObjectURL(blob);
  var w    = window.open(url, '_blank', 'width=480,height=900');
  if (!w) {
    if (typeof toast === 'function')
      toast('⚠️ Popup blocked — allow popups for this page and try again.', 'error');
    URL.revokeObjectURL(url);
    return;
  }
  // Revoke blob URL after window is done using it
  setTimeout(function(){ URL.revokeObjectURL(url); }, 5000);
}

// ── EXPORT RECEIPT AS PDF ─────────────────────────────────────────────────────
// [FIX-R2] Renamed payId parameter to resolvedPayId — no var redeclaration.
// [FIX-R1] Counter assigned here (on finalize), not in buildReceiptHTML.
async function exportReceiptPDF(payId) {
  // [FIX-R2] Resolve payId without re-declaring the parameter
  var resolvedPayId = payId;
  if (!resolvedPayId) {
    var el = document.getElementById('rc-print');
    if (el && el.dataset.payId) resolvedPayId = el.dataset.payId;
  }

  if (!resolvedPayId) {
    if (typeof toast === 'function') toast('❌ Cannot identify payment for this receipt.', 'error');
    return;
  }

  // [FIX-R1] Assign receipt number now (on finalize PDF save)
  _assignReceiptNo(resolvedPayId);

  // ── Electron native path ──────────────────────────────────────────────────
  if (window.electronAPI && window.electronAPI.receiptSavePDF) {
    var studentName = '';
    try {
      var p = DB.payments.find(function(x){ return x.id === resolvedPayId; });
      if (p) studentName = '_' + (p.studentName || '').replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\-]/g,'');
    } catch(e) {}

    var receiptCard = buildReceiptHTML(resolvedPayId) || (function(){
      var el = document.getElementById('rc-print');
      return el ? el.outerHTML : '';
    })();

    var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
      + '<style>'
      + '* { box-sizing:border-box; margin:0; padding:0; }'
      + '@page { size: A4; margin: 18mm; }'
      + 'body { background:#fff; padding:20px; font-family:monospace; }'
      + '#rc-print { max-width:360px; margin:0 auto; border:1px solid #ccc; background:#fff; }'
      + '</style></head><body>'
      + receiptCard
      + '</body></html>';

    var suggestedName = 'Receipt' + studentName + '_' + new Date().toISOString().slice(0,10) + '.pdf';

    try {
      var result = await window.electronAPI.receiptSavePDF(fullHtml, suggestedName);
      if (result.success) {
        if (typeof toast === 'function') toast('✅ PDF saved: ' + result.filePath.split(/[\\\/]/).pop(), 'success');
      } else if (result.reason !== 'cancelled') {
        if (typeof toast === 'function') toast('❌ PDF failed: ' + (result.reason || 'Unknown error'), 'error');
      }
    } catch(e) {
      if (typeof toast === 'function') toast('❌ PDF error. Please try again.', 'error');
    }
    return;
  }

  // ── Fallback: popup + browser Print → Save as PDF ─────────────────────────
  var el = document.getElementById('rc-print');
  if (!el) return;

  // [FIX-R6] Use Blob URL in fallback too
  var printDateTime = new Date().toLocaleString('en-PK',{weekday:'short',day:'2-digit',month:'long',year:'numeric',hour:'2-digit',minute:'2-digit'});
  var wardenName = (typeof CUR_USER!=='undefined' && CUR_USER && CUR_USER.name) ? CUR_USER.name : 'Authorized Warden';

  var fbHtml = '<!DOCTYPE html><html><head><title>Receipt PDF</title>'
    + '<style>'
    + '@page { size: A4; margin: 18mm; }'
    + '@media print { .no-print { display:none !important; } body { background:#fff !important; } }'
    + '* { box-sizing:border-box; }'
    + 'html,body { margin:0; padding:20px; font-family:monospace; background:#eee; color:#111; }'
    + '#rc-print { max-width:360px; margin:0 auto; box-shadow:none !important; border:1px solid #ccc !important; background:#fff !important; }'
    + '.print-meta { max-width:360px; margin:8px auto 0; font-size:9px; color:#888; text-align:center; font-family:monospace; }'
    + '.save-btn   { display:block; margin:16px auto 0; padding:10px 40px; background:#1e5fd4; color:#fff; border:none; border-radius:4px; font-size:13px; font-weight:700; cursor:pointer; }'
    + '</style>'
    + '</head><body>'
    + el.outerHTML
    + '<div class="print-meta">Generated: ' + printDateTime + ' · By: ' + escHtml(wardenName) + '</div>'
    + '<button class="save-btn no-print" onclick="window.print()">💾 Save as PDF (Print → Save as PDF)</button>'
    + '<script>setTimeout(function(){ window.print(); }, 500);<\/script>'
    + '</body></html>';

  var blob2 = new Blob([fbHtml], { type: 'text/html' });
  var url2  = URL.createObjectURL(blob2);
  var w2    = window.open(url2, '_blank', 'width=680,height=900');
  if (!w2) {
    if (typeof toast === 'function') toast('⚠️ Popup blocked — allow popups and try again.', 'error');
    URL.revokeObjectURL(url2);
    return;
  }
  setTimeout(function(){ URL.revokeObjectURL(url2); }, 5000);
}

// ── WHATSAPP PAYMENT REMINDER ─────────────────────────────────────────────────
function sendWA(payId) {
  var p = DB.payments.find(function(x){ return x.id === payId; });
  if (!p) return;
  var student     = DB.students.find(function(s){ return s.id === p.studentId; });
  var rawPhone    = student ? (student.phone || '') : '';
  var wardenPhone = (CUR_USER && CUR_USER.phone) ? CUR_USER.phone : '';
  var defPhone    = wardenPhone || DB.settings.defaultWANumber || '';
  var usePhone    = rawPhone || defPhone;

  if (!usePhone) {
    if(typeof toast === 'function')
      toast('No phone on record. Add a number to the student profile or set Default WA Number in Settings → Hostel Info.', 'error');
    return;
  }
  var phone = usePhone.replace(/[^0-9]/g,'').replace(/^0/,'92');
  var name  = student ? student.name : (p.studentName || 'Student');

  var alreadyPaidRecord = p.studentId ? DB.payments.find(function(x){
    return x.studentId===p.studentId && x.status==='Paid' && x.month===p.month && x.id!==p.id;
  }) : null;
  var isPaid = p.status === 'Paid' || alreadyPaidRecord;
  var msg;
  if (isPaid) {
    msg = 'Assalamu Alaikum *' + name + '*,\n\n'
      + 'Reminder from *' + DB.settings.hostelName + '*\n\n'
      + 'Dear Student,\nIf you have already paid the hostel fee, please accept our thanks for your timely payment. '
      + 'We appreciate your cooperation.\nThank you.\n\n'
      + '✅ Amount Paid: *' + fmtPKR(alreadyPaidRecord ? alreadyPaidRecord.amount : p.amount) + '*\n'
      + 'Month: ' + p.month + '\nRoom #' + (p.roomNumber || '—');
  } else {
    msg = 'Assalamu Alaikum *' + name + '*,\n\n'
      + 'Reminder from *' + DB.settings.hostelName + '*\n\n'
      + 'Dear Student,\nThis is a reminder that your hostel fee is still pending. '
      + 'Please make the payment as soon as possible to avoid any inconvenience.\nThank you for your prompt attention.\n\n'
      + '💰 Pending: *' + fmtPKR(p.unpaid || p.amount) + '*\n'
      + 'Month: ' + p.month + '\nRoom #' + (p.roomNumber || '—');
  }
  openExternalLink('whatsapp://send?phone=' + phone + '&text=' + encodeURIComponent(msg));
}