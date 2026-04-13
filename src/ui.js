// ui.js — small UI primitives: toast + page router.
// No app state. Depends only on DOM and on page-loaders defined in the
// main inline script (loadPortfolio, loadDividend, loadDeposit).

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
  const navMap = { transactions:'거래내역', portfolio:'포트폴리오', dividend:'분배금', deposit:'입금내역', settings:'설정', add:'거래 추가' };
  document.querySelectorAll('.nav-item').forEach(n => {
    if (n.textContent.trim() === (navMap[name] || '')) n.classList.add('active');
  });
  if (name === 'portfolio') loadPortfolio();
  if (name === 'dividend')  loadDividend();
  if (name === 'deposit')   loadDeposit();
}
