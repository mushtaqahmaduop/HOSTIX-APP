/* ─── HOSTYLLO — SHOW / HIDE ON EVERY PASSWORD FIELD ──────────────────────────
   Owner, 2026-09-14, and the warden ledger spec §3.5: "every password/PIN input
   field app-wide gets a show/hide (eye icon) toggle".

   Password fields are built as template strings in several modules (the user
   editor, Reset password, onboarding, and whatever asks for a PIN next), so
   rather than edit each form and rely on the next one remembering, one observer
   gives every input[type=password] an eye button the moment it appears.

     · Inside an .hf-in box (icon + input) the button is the box's last flex
       item, so it sits inside the field's border.
     · Anywhere else the input is wrapped in .pw-eye and the button floats over
       its right edge.
     · An input marked data-pw-eye (the login field has its own toggle) is left
       alone.

   Styles: renderer/pw-eye.css. No dependencies; load order does not matter. */
(function () {
  'use strict';

  var EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/></svg>';

  function enhance(input) {
    if (!input || input.getAttribute('data-pw-eye') !== null || !input.parentNode) return;
    input.setAttribute('data-pw-eye', 'on');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pw-eye__btn';
    btn.setAttribute('aria-label', 'Show password');
    btn.title = 'Show password';
    btn.innerHTML = EYE;
    btn.addEventListener('mousedown', function (e) { e.preventDefault(); }); // keep focus in the field
    btn.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = show ? EYE_OFF : EYE;
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
      btn.title = show ? 'Hide password' : 'Show password';
      btn.classList.toggle('is-on', show);
    });

    var parent = input.parentNode;
    if (parent.classList && parent.classList.contains('hf-in')) {
      parent.insertBefore(btn, input.nextSibling);
    } else {
      var wrap = document.createElement('span');
      wrap.className = 'pw-eye';
      parent.insertBefore(wrap, input);
      wrap.appendChild(input);
      wrap.appendChild(btn);
    }
  }

  function scan(root) {
    if (!root || !root.querySelectorAll) return;
    var list = root.querySelectorAll('input[type="password"]');
    for (var i = 0; i < list.length; i++) enhance(list[i]);
  }

  function start() {
    scan(document);
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var added = muts[i].addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType !== 1) continue;
          if (n.matches && n.matches('input[type="password"]')) enhance(n);
          else scan(n);
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
