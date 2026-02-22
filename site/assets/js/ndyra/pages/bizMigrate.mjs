import { getSupabase, requireAuth } from '../lib/supabase.mjs';

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const c of children) n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  return n;
}

function jsonPretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(cur);
    cur = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === ',') {
      pushField();
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && next === '\n') i++;
      pushField();
      pushRow();
      continue;
    }

    cur += ch;
  }

  pushField();
  pushRow();

  return rows
    .map(r => r.map(c => String(c ?? '').trim()))
    .filter(r => r.some(c => c !== ''));
}

async function callImport({ tenantId, importBatchId, sourceSystem, records }) {
  const supabase = await getSupabase();
  const { data: session } = await supabase.auth.getSession();
  const jwt = session?.session?.access_token;
  if (!jwt) throw new Error('No session token. Please sign in again.');

  const res = await fetch('/.netlify/functions/tenant-migration-import', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      tenant_id: tenantId,
      import_batch_id: importBatchId,
      source_system: sourceSystem,
      records,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error ? `${body.error}${body.details ? ` — ${body.details}` : ''}` : `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return body;
}

function currentStep() {
  const p = window.location.pathname;
  if (p.includes('/biz/migrate/members')) return 'members';
  if (p.includes('/biz/migrate/tokens')) return 'tokens';
  if (p.includes('/biz/migrate/review')) return 'review';
  if (p.includes('/biz/migrate/settings')) return 'settings';
  return 'home';
}

export async function init() {
  await requireAuth();

  const root = document.querySelector('[data-migrate-ui]');
  if (!root) return;

  const step = currentStep();
  root.innerHTML = '';

  if (step === 'home') {
    root.appendChild(el('div', {}, [
      el('p', { class: 'small', text: 'Migration toolkit (staff). Start with members CSV import.' }),
      el('div', { class: 'btn-row' }, [
        el('a', { class: 'btn primary', href: '/biz/migrate/members/' }, ['Import members CSV']),
        el('a', { class: 'btn', href: '/biz/migrate/tokens/' }, ['Token seeding (soon)']),
        el('a', { class: 'btn', href: '/biz/migrate/review/' }, ['Review batches (soon)']),
      ]),
      el('p', { class: 'small', text: 'Blueprint: imports must be idempotent via import_batch_id.' }),
    ]));
    return;
  }

  if (step === 'members') {
    const status = el('div', { class: 'small', text: 'CSV headers: email, membership_status, tokens_starting_balance' });
    const out = el('pre', { class: 'mono', style: 'white-space:pre-wrap; margin-top:12px; display:none;' });

    const tenant = el('input', { class: 'input', type: 'text', placeholder: 'tenant UUID', autocomplete: 'off' });
    const batch = el('input', { class: 'input', type: 'text', placeholder: 'import_batch_id UUID', autocomplete: 'off' });
    const source = el('input', { class: 'input', type: 'text', placeholder: 'source_system (e.g., mindbody)', value: 'external', autocomplete: 'off' });

    const btnNewBatch = el('button', { class: 'btn', text: 'New batch ID' });
    btnNewBatch.addEventListener('click', () => { batch.value = crypto.randomUUID(); });

    const file = el('input', { class: 'input', type: 'file', accept: '.csv,text/csv' });

    const btnImport = el('button', { class: 'btn primary', text: 'Run import' });

    btnImport.addEventListener('click', async () => {
      status.textContent = 'Importing…';
      out.style.display = 'none';

      try {
        const f = file.files?.[0];
        if (!f) throw new Error('Choose a CSV file first.');

        const text = await f.text();
        const rows = parseCsv(text);
        if (rows.length < 2) throw new Error('CSV must include a header row and at least one data row.');

        const headers = rows[0].map(h => String(h || '').trim());
        const idx = (name) => headers.findIndex(h => h.toLowerCase() === name);

        const iEmail = idx('email');
        if (iEmail === -1) throw new Error('CSV missing required header: email');

        const iStatus = idx('membership_status');
        const iTokens = idx('tokens_starting_balance');

        const records = rows.slice(1)
          .map(r => ({
            email: String(r[iEmail] || '').trim(),
            membership_status: iStatus !== -1 ? String(r[iStatus] || '').trim() : undefined,
            tokens_starting_balance: iTokens !== -1 ? Number(r[iTokens]) : 0,
          }))
          .filter(r => r.email);

        if (!tenant.value.trim()) throw new Error('Tenant ID is required.');
        if (!batch.value.trim()) throw new Error('Batch ID is required (click New batch ID).');

        const resp = await callImport({
          tenantId: tenant.value.trim(),
          importBatchId: batch.value.trim(),
          sourceSystem: source.value.trim() || 'external',
          records,
        });

        out.textContent = jsonPretty(resp);
        out.style.display = 'block';
        status.textContent = resp.ok ? 'Import complete ✅' : 'Import failed ⛔';
      } catch (e) {
        status.textContent = `Error: ${e?.message || e}`;
      }
    });

    root.appendChild(el('div', {}, [
      tenant,
      batch,
      el('div', { class: 'btn-row' }, [btnNewBatch]),
      source,
      file,
      el('div', { class: 'btn-row' }, [btnImport, el('a', { class: 'btn', href: '/biz/migrate/' }, ['Back'])]),
      status,
      out,
      el('p', { class: 'small', text: 'Rerun the same batch ID to safely no-op (backend idempotency).' }),
    ]));

    return;
  }

  root.appendChild(el('div', {}, [
    el('p', { class: 'small', text: `Step “${step}” scaffolded. Next: batch review + token seeding UI.` }),
    el('a', { class: 'btn', href: '/biz/migrate/' }, ['Back to migrate home']),
  ]));
}
