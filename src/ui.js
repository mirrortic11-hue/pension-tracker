// ui.js — small UI primitives: toast + page router.
// No app state. Depends only on DOM and on page-loaders defined in the
// main inline script (loadPortfolio, loadDividend, loadDeposit).

function toggleSidebar() {
  const layout = document.querySelector('.layout');
  if (!layout) return;
  const collapsed = layout.classList.toggle('sidebar-collapsed');
  try { localStorage.setItem('sidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
}

function toggleAccount(id) {
  const g = document.getElementById('account-' + id);
  if (!g) return;
  const collapsed = g.classList.toggle('collapsed');
  try { localStorage.setItem('account-collapsed:' + id, collapsed ? '1' : '0'); } catch (e) {}
}

(function initSidebarState() {
  try {
    if (localStorage.getItem('sidebarCollapsed') === '1') {
      document.addEventListener('DOMContentLoaded', () => {
        document.querySelector('.layout')?.classList.add('sidebar-collapsed');
      });
    }
  } catch (e) {}
})();

(function initAccountGroupState() {
  try {
    document.addEventListener('DOMContentLoaded', () => {
      document.querySelectorAll('.account-group').forEach(g => {
        const id = g.id.replace(/^account-/, '');
        if (!id) return;
        if (localStorage.getItem('account-collapsed:' + id) === '1') {
          g.classList.add('collapsed');
        }
      });
    });
  } catch (e) {}
})();

function showToast(msg, type='info') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = `toast ${type} show`;
  setTimeout(() => el.classList.remove('show'), 3000);
}

function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const page = document.getElementById('page-' + name);
  if (page) page.classList.add('active');
  // data-route 매칭. nav-sub는 data-account 스코프로 현재 활성 계좌만 표시.
  const accId = (typeof currentAccountId !== 'undefined') ? currentAccountId : null;
  document.querySelectorAll('.nav-item[data-route="' + name + '"]').forEach(n => {
    const acc = n.getAttribute('data-account');
    if (!acc || acc === accId) n.classList.add('active');
  });
  if (name === 'transactions' && typeof loadAllData === 'function'
      && (typeof allRows === 'undefined' || !allRows.length)) {
    loadAllData();
  }
  if (name === 'portfolio') loadPortfolio();
  if (name === 'dividend')  loadDividend();
  if (name === 'deposit')   loadDeposit();
  if (name === 'account-settings' && typeof loadDivGoalForm === 'function') { loadDivGoalForm(); loadPfGoalForm(); }
  if (name === 'calculator' && typeof loadCalculatorPage === 'function') loadCalculatorPage();
}

function switchCalcTab(tab) {
  const compBtn = document.getElementById('calcTabCompound');
  const avgBtn  = document.getElementById('calcTabAvgDown');
  const compPane = document.getElementById('calcPaneCompound');
  const avgPane  = document.getElementById('calcPaneAvgDown');
  if (!compBtn || !avgBtn || !compPane || !avgPane) return;
  const isComp = (tab === 'compound');
  compBtn.classList.toggle('active', isComp);
  avgBtn.classList.toggle('active', !isComp);
  compPane.style.display = isComp ? '' : 'none';
  avgPane.style.display  = isComp ? 'none' : '';
}
