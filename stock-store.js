// Online-only: Supabase is authoritative. No IndexedDB, offline writes or outbox.
(function setupStockStore() {
  'use strict';
  const cfg = window.STOCK_APP_CONFIG || {};
  const tables = { users: cfg.supabaseTables?.users || 'users', items: cfg.supabaseTables?.items || 'items', logs: cfg.supabaseTables?.stockLogs || 'stock_logs' };
  const keys = [cfg.supabasePublishableKey, cfg.supabaseAnonKey].filter((key, i, all) => key && !key.startsWith('PASTE_') && all.indexOf(key) === i);
  let client, handler, records = [], revision = 0, readPromise, activeWrite;
  // Only retains the ID of an HTTP request with an unknown result, in memory.
  // Never automatically submitted on reconnect; never persisted.
  let uncertainRequest = null;
  let status = { configured: false, syncing: false, writing: false, uncertain: false, pendingCount: 0, reviewCount: 0, lastError: null, lastSyncedAt: null };
  let supportsAllowedViews = true;
  const ok = data => ({ isOk: true, data });
  const fail = error => ({ isOk: false, error: error?.message || String(error) });
  const id = () => window.crypto?.randomUUID?.() || Date.now().toString(36) + '-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
  const missing = (error, column) => String(error?.message || '').includes(column) && /column|schema cache|could not find/i.test(error.message);
  const transportError = error => !error?.code || /fetch|network|timeout|load failed|abort/i.test(error.message || '') || Number(error.status) >= 500;
  function publish(patch = {}) {
    status = { ...status, configured: Boolean(client), uncertain: Boolean(uncertainRequest), ...patch };
    window.stockAppSyncStatus = { ...status };
    window.dispatchEvent?.(new CustomEvent('stock-sync-status'));
    return { ...status };
  }
  function emit() {
    handler?.onDataChanged?.(records.filter(record => !record._deleted).sort((a, b) => String(a.__backendId).localeCompare(String(b.__backendId))));
  }
  function requireOnline() {
    if (!client) throw new Error('Koneksi Supabase belum siap. Muat ulang aplikasi.');
    if (!navigator.onLine) throw new Error('Tidak ada koneksi internet. Perubahan belum dikirim; coba lagi setelah terhubung.');
  }
  function actor() {
    const user = window.currentUser;
    if (!user?.__backendId || !user.pin) throw new Error('Login ulang sebelum melakukan perubahan stok.');
    return { actor_id: user.__backendId, actor_pin: user.pin };
  }
  async function rpc(name, request) {
    let query = client.rpc(name, { p_request: request });
    if (typeof query.abortSignal === 'function' && typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      query = query.abortSignal(AbortSignal.timeout(15000));
    }
    return await query;
  }
  function fromItem(row) {
    return { __backendId: row.id, type: 'item', name: row.name, category: row.category || '', price: Number(row.price) || 0, tracks_stock: row.tracks_stock !== false, stock: Number(row.stock) || 0, min_stock: Number(row.min_stock) || 0, updated_at: row.updated_at, _deleted: Boolean(row.deleted_at) };
  }
  function fromLog(row) {
    return { __backendId: row.id, type: 'tx', item_id: row.item_id, name: row.item_name, category: row.category || '', price: Number(row.price) || 0, user_name: row.user_name, tx_type: row.tx_type, qty: Number(row.qty) || 0, stock_before: Number(row.stock_before) || 0, stock_after: Number(row.stock_after) || 0, note: row.note || '', timestamp: row.created_at, updated_at: row.updated_at, _deleted: Boolean(row.deleted_at) };
  }
  function fromUser(row) {
    return { __backendId: row.id, type: 'user', name: row.name, pin: row.pin, role: row.role, allowed_views: row.allowed_views == null ? undefined : normalizeAllowedViews(row.allowed_views, row.role), updated_at: row.updated_at, _deleted: Boolean(row.deleted_at) };
  }
  function accept(changes) {
    const next = new Map(records.map(record => [record.__backendId, record]));
    changes.forEach(record => next.set(record.__backendId, record));
    records = [...next.values()]; revision++; emit();
  }
  function acceptStock(data) {
    if (!data || !Array.isArray(data.items) || !Array.isArray(data.logs)) throw new Error('Respons Supabase tidak lengkap. Periksa hasil transaksi sebelum mengulang.');
    accept([...data.items.map(fromItem), ...data.logs.map(fromLog)]);
  }
  async function rows(table, columns) {
    const result = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await client.from(table).select(columns).order('updated_at', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 999);
      if (error) throw error;
      result.push(...(data || []));
      if ((data || []).length < 1000) return result;
    }
  }
  async function pull() {
    const startedRevision = revision;
    let users, items;
    try { users = await rows(tables.users, 'id,name,pin,role,allowed_views,updated_at,deleted_at'); }
    catch (error) {
      if (!missing(error, 'allowed_views')) throw error;
      supportsAllowedViews = false;
      users = await rows(tables.users, 'id,name,pin,role,updated_at,deleted_at');
    }
    try { items = await rows(tables.items, 'id,name,category,price,tracks_stock,stock,min_stock,updated_at,deleted_at'); }
    catch (error) {
      if (!missing(error, 'tracks_stock')) throw error;
      items = await rows(tables.items, 'id,name,category,price,stock,min_stock,updated_at,deleted_at');
    }
    const logs = await rows(tables.logs, 'id,item_id,item_name,category,price,user_name,tx_type,qty,stock_before,stock_after,note,created_at,updated_at,deleted_at');
    if (startedRevision !== revision) return; // Do not undo an acknowledged write with an older read.
    records = [...users.map(fromUser), ...items.map(fromItem), ...logs.map(fromLog)];
    revision++; emit();
  }
  async function syncNow() {
    if (readPromise) return readPromise;
    readPromise = Promise.resolve().then(async () => {
      try {
        requireOnline(); publish({ syncing: true });
        await pull();
        return publish({ syncing: false, lastError: uncertainRequest ? status.lastError : null, lastSyncedAt: new Date().toISOString() });
      } catch (error) { return publish({ syncing: false, lastError: error.message || String(error) }); }
      finally { readPromise = null; }
    });
    return readPromise;
  }
  function fingerprint(kind, fields, user) {
    if (kind === 'movement') return JSON.stringify([user.actor_id, kind, fields.timestamp.slice(0, 10), fields.entries.map(e => [e.item_id, e.tx_type, e.qty, e.note])]);
    return JSON.stringify([user.actor_id, kind, fields]);
  }
  function writeStock(kind, fields) {
    if (activeWrite || status.writing) return Promise.resolve(fail(new Error('Sedang menyimpan ke Supabase. Tunggu hingga selesai.')));
    const operation = (async () => {
      try {
        requireOnline();
        const user = actor(), key = fingerprint(kind, fields, user);
        if (uncertainRequest && uncertainRequest.key !== key) throw new Error('Hasil transaksi sebelumnya belum pasti. Tekan status koneksi untuk memeriksanya sebelum membuat perubahan lain.');
        const request = uncertainRequest?.request || { id: id(), kind, ...user, ...fields };
        publish({ writing: true, lastError: null });
        // Same ID on a single immediate retry: a lost response cannot count twice.
        for (let attempt = 0; attempt < 2; attempt++) {
          let response;
          try { response = await rpc('stock_write_v2', request); }
          catch (error) { response = { error }; }
          if (response.error) {
            if (!transportError(response.error)) { uncertainRequest = null; throw response.error; }
            uncertainRequest = { key, request };
            if (attempt === 0 && navigator.onLine) continue;
            throw new Error('Koneksi terputus saat menyimpan. Hasil belum dapat dipastikan. Coba ulang tombol yang sama atau tekan status koneksi untuk memeriksa Supabase.');
          }
          uncertainRequest = { key, request }; // Keep ID if the response is malformed.
          acceptStock(response.data);
          uncertainRequest = null;
          publish({ writing: false, lastError: null, lastSyncedAt: new Date().toISOString() });
          return ok(response.data);
        }
      } catch (error) {
        publish({ writing: false, lastError: error.message || String(error) });
        return fail(error);
      }
    })();
    activeWrite = operation;
    return operation.finally(() => { if (activeWrite === operation) activeWrite = null; });
  }
  async function userWrite(record, deleted = false) {
    try {
      requireOnline();
      if (record.type !== 'user') throw new Error('Perubahan stok wajib melalui operasi stok server.');
      if (activeWrite || status.writing || uncertainRequest) throw new Error('Selesaikan pemeriksaan transaksi stok terlebih dahulu.');
      publish({ writing: true, lastError: null });
      const row = { id: record.__backendId || id(), name: record.name || '', pin: record.pin || '', role: record.role || 'staff', updated_at: new Date().toISOString(), deleted_at: deleted ? new Date().toISOString() : null };
      if (supportsAllowedViews) row.allowed_views = normalizeAllowedViews(record.allowed_views, record.role);
      let response = await client.from(tables.users).upsert(row, { onConflict: 'id' }).select();
      if (response.error && missing(response.error, 'allowed_views')) {
        supportsAllowedViews = false; delete row.allowed_views;
        response = await client.from(tables.users).upsert(row, { onConflict: 'id' }).select();
      }
      if (response.error) throw response.error;
      if (!response.data?.length) throw new Error('Supabase belum mengonfirmasi perubahan pengguna.');
      accept(response.data.map(fromUser));
      publish({ writing: false, lastError: null, lastSyncedAt: new Date().toISOString() });
      return ok(response.data);
    } catch (error) { publish({ writing: false, lastError: error.message || String(error) }); return fail(error); }
  }
  window.stockStore = {
    async init(dataHandler) {
      handler = dataHandler;
      if (!cfg.supabaseUrl || !keys.length || !window.supabase?.createClient) return fail(new Error('Konfigurasi Supabase belum lengkap.'));
      for (const key of keys) {
        client = window.supabase.createClient(cfg.supabaseUrl, key);
        const result = await syncNow();
        if (!result.lastError || !/api.?key|jwt|401/i.test(result.lastError)) break;
      }
      window.addEventListener('online', syncNow);
      window.addEventListener('offline', () => publish());
      window.addEventListener('focus', syncNow);
      window.addEventListener('beforeunload', event => {
        if (activeWrite || uncertainRequest) { event.preventDefault(); event.returnValue = ''; }
      });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) void syncNow(); });
      setInterval(() => { if (!document.hidden && navigator.onLine && !activeWrite) void syncNow(); }, 30000);
      return status.lastError ? fail(new Error(status.lastError)) : ok();
    },
    create: record => userWrite(record), update: record => userWrite(record),
    delete: record => record.type === 'item' ? writeStock('delete_item', { item_id: record.__backendId, expected_updated_at: record.updated_at }) : userWrite(record, true),
    applyMovement(cart, txType, timestamp) {
      if (!['IN', 'OUT'].includes(txType) || !cart.length) return Promise.resolve(fail(new Error('Transaksi kosong atau jenis transaksi tidak valid.')));
      const seen = new Set(), entries = [];
      for (const line of cart) {
        const qty = Number(line.qty);
        if (!line.itemId || seen.has(line.itemId) || !Number.isSafeInteger(qty) || qty <= 0) return Promise.resolve(fail(new Error('Barang atau jumlah transaksi tidak valid.')));
        seen.add(line.itemId); entries.push({ id: id(), item_id: line.itemId, tx_type: txType, qty, note: line.note || '' });
      }
      return writeStock('movement', { entries, timestamp });
    },
    saveItem(record, original) {
      const item = { id: record.__backendId || id(), name: record.name, category: record.category || '', price: Number(record.price) || 0, tracks_stock: record.tracks_stock !== false, stock: Number(record.stock) || 0, min_stock: Number(record.min_stock) || 0 };
      if (!original && uncertainRequest?.request.kind === 'save_item') item.id = uncertainRequest.request.item.id;
      return writeStock('save_item', { item, expected_updated_at: original?.updated_at || null });
    },
    reverseMovement: log => writeStock('reverse', { tx_id: log.__backendId }),
    async resolveUncertain() {
      if (!uncertainRequest) return ok();
      if (activeWrite || status.writing) return fail(new Error('Tunggu proses penyimpanan selesai.'));
      try {
        requireOnline(); publish({ writing: true });
        const request = uncertainRequest.request;
        const { data, error } = await rpc('stock_cancel_v2', request);
        if (error) throw error;
        acceptStock(data); uncertainRequest = null;
        publish({ writing: false, lastError: null });
        await syncNow();
        return ok({ cancelled: Boolean(data.cancelled), request });
      } catch (error) { publish({ writing: false, lastError: error.message || String(error) }); return fail(error); }
    },
    syncNow,
    syncAfterWrite: async () => { if (activeWrite) await activeWrite; return { ...status }; },
    getSyncStatus: async () => ok({ ...status })
  };
})();
