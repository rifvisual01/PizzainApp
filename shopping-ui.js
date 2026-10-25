(function (root) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  const lines = raw => { try { return Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch { return []; } };
  const amount = value => 'Rp ' + (Number(value) || 0).toLocaleString('id-ID');
  const total = transaction => [...lines(transaction.items), ...lines(transaction.operasional)].reduce((sum, item) => sum + (Number(item[3]) || 0), 0);
  const dateKey = value => new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Jakarta', year:'numeric', month:'2-digit', day:'2-digit' }).format(new Date(value));
  const timestamp = transaction => transaction.submitted_at || transaction.created_at;
  const safePhoto = url => /^https?:\/\//i.test(url || '') ? url : '';

  // One report card for both admin reports and staff's submitted-today list.
  function createCard(transaction, options = {}) {
    const document = options.document || root.document;
    const card = document.createElement('div');
    card.className = 'border-2 border-gray-200 rounded-xl bg-white overflow-hidden hover:border-red-400 transition-all';
    const bahan = lines(transaction.items), operational = lines(transaction.operasional);
    const date = new Date(timestamp(transaction)).toLocaleString('id-ID', { timeZone:'Asia/Jakarta', day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' });
    const photo = safePhoto(options.normalizePhoto ? options.normalizePhoto(transaction.foto_url) : transaction.foto_url);
    const renderLines = (title, values) => `<h4 class="text-sm font-semibold text-gray-700 mt-2 mb-1">${title}</h4>${values.length ? values.map(item => `<div class="flex items-start justify-between gap-3 text-sm text-gray-600 py-1"><span class="min-w-0" style="overflow-wrap:anywhere">${escape(item[0])}<small class="block text-gray-400">${escape(item[1])}x @ ${amount(item[2])}</small></span><span class="shrink-0 whitespace-nowrap font-semibold">${amount(item[3])}</span></div>`).join('') : '<p class="text-xs text-gray-400">Tidak ada</p>'}`;
    card.innerHTML = `<button type="button" class="shopping-card-toggle w-full text-left p-3 flex items-start justify-between gap-3" aria-expanded="false">
      <span class="min-w-0"><span class="block font-bold text-gray-800" style="overflow-wrap:anywhere">${escape(transaction.tempat_belanja || 'Tanpa Tempat')}</span><span class="block text-xs text-gray-500 mt-1">${escape(date)}${transaction.user_name ? ' · ' + escape(transaction.user_name) : ''}</span></span>
      <span class="shrink-0 text-right"><span class="block font-bold text-red-600 whitespace-nowrap">${amount(total(transaction))}</span><span class="block text-xs text-gray-500">${bahan.length + operational.length} item <span class="shopping-card-arrow" aria-hidden="true">⌄</span></span></span>
    </button><div class="shopping-card-detail hidden px-3 pb-3 border-t border-gray-100">
      ${renderLines('Bahan Baku', bahan)}${renderLines('Operasional', operational)}
      ${photo ? `<div class="mt-3"><p class="text-sm font-semibold text-gray-700 mb-2">Foto Bukti</p><img loading="lazy" src="${escape(photo)}" referrerpolicy="no-referrer" class="w-full h-auto rounded-xl border border-gray-200" alt="Bukti belanja"></div>` : ''}
      ${options.canManage ? '<div class="flex gap-2 mt-3 pt-3 border-t border-gray-100"><button type="button" class="shopping-card-edit flex-1 py-2 rounded-lg bg-red-600 text-white font-semibold">Edit</button><button type="button" class="shopping-card-delete flex-1 py-2 rounded-lg border border-red-200 text-red-600 font-semibold">Hapus</button></div>' : ''}
    </div>`;
    const toggle = card.querySelector('.shopping-card-toggle');
    toggle.addEventListener('click', event => {
      event.stopPropagation();
      const expanded = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(expanded));
      card.querySelector('.shopping-card-detail').classList.toggle('hidden', !expanded);
    });
    if (options.canManage) {
      card.querySelector('.shopping-card-edit').addEventListener('click', event => { event.stopPropagation(); options.onEdit(transaction); });
      card.querySelector('.shopping-card-delete').addEventListener('click', event => { event.stopPropagation(); options.onDelete(transaction, event.currentTarget); });
    }
    return card;
  }
  const api = { createCard, total, dateKey, timestamp, lines, escape, amount };
  root.ShoppingUI = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
