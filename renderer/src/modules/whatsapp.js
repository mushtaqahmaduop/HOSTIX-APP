/* ─── HOSTYLLO — WHATSAPP REMINDERS ──────────────────────────────────────────
   Contains: showRentReminderModal, waBuildLinks, waSaveDefaultNumber,
             waViewPendingStudents.

   Split out of settings.js, which had grown to hold settings, data retention,
   issues CRUD and this modal. Styles live in renderer/whatsapp.css.

   Opened from the Payments toolbar and the dashboard's Pending Payments card.
   ─────────────────────────────────────────────────────────────────────────── */
'use strict';

// ════════════════════════════════════════════════════════════════════════════
// WHATSAPP BULK RENT REMINDER
// ════════════════════════════════════════════════════════════════════════════
function showRentReminderModal() {
  var pending = DB.payments.filter(function(p){return p.status==='Pending';});
  var studentIds = [];
  pending.forEach(function(p){if(p.studentId&&studentIds.indexOf(p.studentId)<0) studentIds.push(p.studentId);});
  var list = studentIds.map(function(sid){
    var s = DB.students.find(function(x){return x.id===sid;});
    var dues = pending.filter(function(p){return p.studentId===sid;});
    var totalDue = dues.reduce(function(sum,p){return sum+Number(p.unpaid!=null?p.unpaid:(p.amount||0));},0);
    var activeDues = dues.filter(function(p){return Number(p.unpaid!=null?p.unpaid:(p.amount||0))>0;});
    return {student:s, dues:activeDues, totalDue:totalDue};
  }).filter(function(x){return x.student && x.totalDue>0;});

  var wardenPhone = (CUR_USER&&CUR_USER.phone) ? CUR_USER.phone : '';
  var defaultNum = DB.settings.defaultWANumber || wardenPhone || '';
  var defaultNumFmt = defaultNum.replace(/[^0-9]/g,'').replace(/^0/,'92');

  var WA_GLYPH = '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';

  // ── Default notification number ───────────────────────────────────────────
  // Built separately: a ternary spanning a `+`-concatenation chain is easy to
  // break and hard to read.
  var notifyBtn = '';
  if (defaultNumFmt) {
    notifyBtn = '<button class="wa-btn wa-btn--go" onclick="openExternalLink(\'https://wa.me/'+defaultNumFmt+'\')">'
      + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>'
      + 'Notify Now</button>';
  }

  var header = ''
    + '<div class="wa-card">'
    +   '<div class="wa-card__hd">'
    +     '<span class="wa-card__t">Default Notification Number</span>'
    +     '<span class="wa-card__s">Send all reminders to this number</span>'
    +   '</div>'
    +   '<div class="wa-num">'
    +     '<div class="wa-num__f">'
    +       '<span class="wa-num__ic"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg></span>'
    +       '<input id="wa-default-num" placeholder="e.g. 03001234567" value="'+escHtml(defaultNum)+'">'
    +     '</div>'
    +     '<button class="wa-btn" onclick="waSaveDefaultNumber()">'
    +       '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/></svg>'
    +       'Save</button>'
    +     notifyBtn
    +   '</div>'
    + '</div>';

  // ── Pending banner ────────────────────────────────────────────────────────
  var info = ''
    + '<div class="wa-note">'
    +   '<span class="wa-note__ic"><svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/></svg></span>'
    +   '<div class="wa-note__c">'
    +     '<div class="wa-note__t">'+list.length+' student'+(list.length===1?'':'s')+' '+(list.length===1?'has':'have')+' pending payments</div>'
    +     '<div class="wa-note__s">Phone numbers are auto-fetched from student records. Use any button to open WhatsApp.</div>'
    +   '</div>'
    +   (list.length ? '<button class="wa-note__btn" onclick="waViewPendingStudents()">'
    +     '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/></svg>'
    +     'View Students</button>' : '')
    + '</div>';

  // ── Student rows ──────────────────────────────────────────────────────────
  var rows = '';
  if(list.length===0) {
    rows = '<div class="wa-empty">'
         + '<svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/></svg>'
         + '<div class="wa-empty__t">All rents collected</div>'
         + '<div class="wa-empty__s">Nobody has an outstanding balance right now.</div></div>';
  } else {
    list.forEach(function(item){
      var student  = item.student;
      var dues     = item.dues;
      var totalDue = item.totalDue;
      var room     = DB.rooms.find(function(r){return r.id===student.roomId;});
      var rawPhone = (student.phone||'').replace(/[^0-9]/g,'').replace(/^0/,'92');
      var nm  = String(student.name||'?');
      var ini = nm.trim().split(/\s+/).slice(0,2).map(function(w){return w[0]||'';}).join('').toUpperCase() || '?';
      var msg = encodeURIComponent('Assalamu Alaikum *'+student.name+'*,\n\n'
        +'Reminder from *'+DB.settings.hostelName+'*\n\n'
        +'Dear Student,\n'
        +'This is a reminder that your hostel fee is still pending. Please make the payment as soon as possible to avoid any inconvenience, otherwise late fee charges may apply.\n'
        +'Thank you for your prompt attention.\n\n'
        +'💰 Pending Amount: *'+fmtPKR(totalDue)+'*\n'
        +'Room: #'+(room?room.number:'—')+'\n'
        +'Month(s): '+dues.map(function(d){return d.month;}).join(', '));
      // msg is already URL-encoded — do not encode it again. wa.me is the web fallback.
      var links      = waBuildLinks(rawPhone, msg);
      var waDeepLink = links.app;
      var waWebLink  = links.web;

      rows += '<div class="wa-row">'
        + '<div class="wa-row__av '+payAvatarHue(nm)+'">'+escHtml(ini)+'</div>'
        + '<div class="wa-row__c">'
        +   '<div class="wa-row__n">'+escHtml(nm)+'</div>'
        +   '<div class="wa-row__m">'
        +     '<span>Room '+(room?'#'+escHtml(String(room.number)):'—')+'</span><i></i>'
        +     '<span>'+dues.length+' month'+(dues.length===1?'':'s')+'</span><i></i>'
        +     '<b>'+fmtPKR(totalDue)+' due</b>'
        +   '</div>'
        +   '<div class="wa-row__p">'
        +     '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92"/></svg>'
        +     (student.phone ? escHtml(student.phone) : '<span class="wa-row__nop">No phone number on record</span>')
        +   '</div>'
        + '</div>'
        + '<div class="wa-row__acts">'
        + (rawPhone
            ? '<button class="wa-pill wa-pill--app" onclick="openExternalLink(\''+waDeepLink+'\')" title="Open in the WhatsApp app">'+WA_GLYPH+'WhatsApp</button>'
              + '<button class="wa-pill wa-pill--web" onclick="openExternalLink(\''+waWebLink+'\')" title="Open WhatsApp Web">'
              + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z"/></svg>Web</button>'
            : '<span class="wa-row__nop">No number</span>')
        + '<button class="wa-go" onclick="closeModal();showViewStudentModal(\''+student.id+'\')" title="Open student">'
        + '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>'
        + '</div></div>';
    });
  }

  var title = '<div class="wa-hd">'
    + '<span class="wa-hd__ic">'+WA_GLYPH+'</span>'
    + '<div><div class="wa-hd__t">WhatsApp Reminders</div>'
    + '<div class="wa-hd__s">Send payment reminders to students via WhatsApp.</div></div></div>';

  showModal('modal-lg', title, '<div class="wa-body">'+header+info+rows+'</div>');
}

// Build the app + web WhatsApp links for an already-encoded message.
//
// Both preload.js and main.js reject any external URL longer than 2048 chars,
// and they do it silently — a long hostel name plus several outstanding months
// can push the prefilled message past that, and the button would simply do
// nothing. Trim the encoded message so the longer of the two links stays under
// the limit; the reminder still opens, just with the tail cut.
function waBuildLinks(rawPhone, encodedMsg) {
  if (!rawPhone) return { app: '', web: '' };
  var LIMIT  = 1900;                                     // headroom under 2048
  var appPre = 'whatsapp://send?phone=' + rawPhone + '&text=';
  var webPre = 'https://wa.me/' + rawPhone + '?text=';
  var budget = LIMIT - Math.max(appPre.length, webPre.length);
  var msg    = encodedMsg;
  if (msg.length > budget) {
    msg = msg.slice(0, budget);
    // Never cut mid-escape: %XX must survive whole or the URL is malformed.
    msg = msg.replace(/%[0-9A-Fa-f]?$/, '');
  }
  return { app: appPre + msg, web: webPre + msg };
}

// Persist the default notification number. Split out of the modal markup — it
// was an inline async IIFE inside an onclick attribute, which no linter or
// syntax check could ever see into.
async function waSaveDefaultNumber() {
  var el = document.getElementById('wa-default-num');
  if (!el) return;
  DB.settings.defaultWANumber = el.value.trim();
  await saveDB();
  toast('Default number saved', 'success');
}

// "View Students" — the app's list of who owes money is the Payments screen
// filtered to unpaid, so send them there rather than to the full student roll.
function waViewPendingStudents() {
  closeModal();
  if (typeof payFilter !== 'undefined' && payFilter) {
    payFilter.unpaidOnly = true;
    payFilter.showAll    = true;
    payFilter.page       = 1;
  }
  navigate('payments');
}
