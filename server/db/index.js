const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const STATUS_VALUES = new Set(['OPEN', 'IN_TRANSIT', 'COMPLETE']);
const LEG_EVENT_TYPES = new Set([
  'ASSIGNED',
  'START_ROUTE',
  'PAUSE_ROUTE',
  'RESUME_ROUTE',
  'ARRIVED',
  'HANDOFF_READY',
  'HANDOFF_NOTIFIED',
  'HANDOFF_COMPLETE',
  'AUTO_START_ROUTE'
]);
const HANDOFF_STATUS_VALUES = new Set(['PENDING', 'READY', 'COMPLETE']);

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
const useSupabase = Boolean(supabaseUrl && supabaseKey);

const supabase = useSupabase ? createClient(supabaseUrl, supabaseKey) : null;
let sqliteDb = null;

const SQLITE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS loads (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  miles NUMERIC NOT NULL,
  contract_total_payout_cents INTEGER,
  status TEXT NOT NULL CHECK (status IN ('OPEN','IN_TRANSIT','COMPLETE')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS drivers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  current_lat NUMERIC,
  current_lng NUMERIC,
  hos_remaining_hours NUMERIC,
  home_lat NUMERIC,
  home_lng NUMERIC
);

CREATE TABLE IF NOT EXISTS legs (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  origin_address TEXT,
  destination_address TEXT,
  miles NUMERIC NOT NULL,
  handoff_point TEXT,
  rate_cents INTEGER NOT NULL,
  payout_per_mile_cents INTEGER,
  status TEXT NOT NULL CHECK (status IN ('OPEN','IN_TRANSIT','COMPLETE')),
  driver_id TEXT REFERENCES drivers(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS contacts (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  broker_name TEXT NOT NULL,
  broker_email TEXT NOT NULL,
  last_worked_together TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  driver_id TEXT NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leg_events (
  id TEXT PRIMARY KEY,
  leg_id TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  driver_id TEXT,
  event_type TEXT NOT NULL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS handoffs (
  id TEXT PRIMARY KEY,
  load_id TEXT NOT NULL REFERENCES loads(id) ON DELETE CASCADE,
  from_leg_id TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  to_leg_id TEXT NOT NULL REFERENCES legs(id) ON DELETE CASCADE,
  from_driver_id TEXT,
  to_driver_id TEXT,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(from_leg_id, to_leg_id)
);

CREATE INDEX IF NOT EXISTS legs_load_id_idx ON legs(load_id);
CREATE INDEX IF NOT EXISTS legs_status_idx ON legs(status);
CREATE INDEX IF NOT EXISTS contacts_driver_id_idx ON contacts(driver_id);
CREATE INDEX IF NOT EXISTS accounts_email_idx ON accounts(email);
CREATE INDEX IF NOT EXISTS accounts_driver_id_idx ON accounts(driver_id);
CREATE INDEX IF NOT EXISTS leg_events_leg_id_idx ON leg_events(leg_id);
CREATE INDEX IF NOT EXISTS handoffs_load_id_idx ON handoffs(load_id);
`;

function assertStatus(status) {
  if (!STATUS_VALUES.has(status)) {
    throw new Error(`Invalid status: ${status}`);
  }
}

function assertLegEventType(eventType) {
  if (!LEG_EVENT_TYPES.has(eventType)) {
    throw new Error(`Invalid leg event type: ${eventType}`);
  }
}

function assertHandoffStatus(status) {
  if (!HANDOFF_STATUS_VALUES.has(status)) {
    throw new Error(`Invalid handoff status: ${status}`);
  }
}

async function getSqliteDb() {
  if (sqliteDb) {
    return sqliteDb;
  }

  const sqlitePath = process.env.SQLITE_PATH || path.join(process.cwd(), 'data', 'freightbite.db');
  fs.mkdirSync(path.dirname(sqlitePath), { recursive: true });

  sqliteDb = await open({ filename: sqlitePath, driver: sqlite3.Database });
  await sqliteDb.exec(SQLITE_SCHEMA);

  // Migrate existing DBs: add address columns if missing
  try { await sqliteDb.exec('ALTER TABLE legs ADD COLUMN origin_address TEXT'); } catch (_) { /* already exists */ }
  try { await sqliteDb.exec('ALTER TABLE legs ADD COLUMN destination_address TEXT'); } catch (_) { /* already exists */ }
  try { await sqliteDb.exec('ALTER TABLE loads ADD COLUMN contract_total_payout_cents INTEGER'); } catch (_) { /* already exists */ }
  try { await sqliteDb.exec('ALTER TABLE legs ADD COLUMN payout_per_mile_cents INTEGER'); } catch (_) { /* already exists */ }

  return sqliteDb;
}

async function createLoad(load) {
  const payload = {
    origin: load.origin,
    destination: load.destination,
    miles: load.miles,
    contract_total_payout_cents: load.contract_total_payout_cents ?? null,
    status: load.status || 'OPEN'
  };

  assertStatus(payload.status);

  if (useSupabase) {
    const { data, error } = await supabase
      .from('loads')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  const id = load.id || crypto.randomUUID();

  await db.run(
    'INSERT INTO loads (id, origin, destination, miles, contract_total_payout_cents, status) VALUES (?, ?, ?, ?, ?, ?)',
    [id, payload.origin, payload.destination, payload.miles, payload.contract_total_payout_cents, payload.status]
  );

  return db.get('SELECT * FROM loads WHERE id = ?', [id]);
}

async function createLegs(legs) {
  const payload = legs.map((leg) => {
    const status = leg.status || 'OPEN';
    assertStatus(status);

    return {
      id: leg.id || crypto.randomUUID(),
      load_id: leg.load_id,
      sequence: leg.sequence,
      origin: leg.origin,
      destination: leg.destination,
      origin_address: leg.origin_address || null,
      destination_address: leg.destination_address || null,
      miles: leg.miles,
      handoff_point: leg.handoff_point || null,
      rate_cents: leg.rate_cents,
      payout_per_mile_cents: leg.payout_per_mile_cents ?? null,
      status,
      driver_id: leg.driver_id || null
    };
  });

  if (useSupabase) {
    const { data, error } = await supabase
      .from('legs')
      .insert(payload)
      .select('*');

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  await db.exec('BEGIN');

  try {
    for (const leg of payload) {
      await db.run(
        `INSERT INTO legs
        (id, load_id, sequence, origin, destination, origin_address, destination_address, miles, handoff_point, rate_cents, payout_per_mile_cents, status, driver_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          leg.id,
          leg.load_id,
          leg.sequence,
          leg.origin,
          leg.destination,
          leg.origin_address,
          leg.destination_address,
          leg.miles,
          leg.handoff_point,
          leg.rate_cents,
          leg.payout_per_mile_cents,
          leg.status,
          leg.driver_id
        ]
      );
    }

    await db.exec('COMMIT');
  } catch (error) {
    await db.exec('ROLLBACK');
    throw error;
  }

  const ids = payload.map((leg) => leg.id);
  const placeholders = ids.map(() => '?').join(',');
  return db.all(`SELECT * FROM legs WHERE id IN (${placeholders})`, ids);
}

async function createDriver(driver) {
  const payload = {
    name: driver.name,
    email: driver.email,
    current_lat: driver.current_lat ?? null,
    current_lng: driver.current_lng ?? null,
    hos_remaining_hours: driver.hos_remaining_hours ?? null,
    home_lat: driver.home_lat ?? null,
    home_lng: driver.home_lng ?? null
  };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('drivers')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  const id = driver.id || crypto.randomUUID();
  await db.run(
    `INSERT INTO drivers
    (id, name, email, current_lat, current_lng, hos_remaining_hours, home_lat, home_lng)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      payload.name,
      payload.email,
      payload.current_lat,
      payload.current_lng,
      payload.hos_remaining_hours,
      payload.home_lat,
      payload.home_lng
    ]
  );

  return db.get('SELECT * FROM drivers WHERE id = ?', [id]);
}

async function createContact(contact) {
  const payload = {
    driver_id: contact.driver_id,
    broker_name: contact.broker_name,
    broker_email: contact.broker_email,
    last_worked_together: contact.last_worked_together ?? null
  };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('contacts')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  const id = contact.id || crypto.randomUUID();
  await db.run(
    `INSERT INTO contacts
    (id, driver_id, broker_name, broker_email, last_worked_together)
    VALUES (?, ?, ?, ?, ?)`,
    [id, payload.driver_id, payload.broker_name, payload.broker_email, payload.last_worked_together]
  );

  return db.get('SELECT * FROM contacts WHERE id = ?', [id]);
}

async function createAccount(account) {
  const payload = {
    driver_id: account.driver_id,
    email: account.email,
    password_hash: account.password_hash
  };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('accounts')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  const id = account.id || crypto.randomUUID();
  await db.run(
    `INSERT INTO accounts (id, driver_id, email, password_hash)
    VALUES (?, ?, ?, ?)`,
    [id, payload.driver_id, payload.email, payload.password_hash]
  );
  return db.get('SELECT * FROM accounts WHERE id = ?', [id]);
}

async function getAccountByEmail(email) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM accounts WHERE lower(email) = lower(?)', [email]);
}

async function getDriverByAccountEmail(email) {
  if (useSupabase) {
    const account = await getAccountByEmail(email);
    if (!account) {
      return null;
    }
    return getDriverById(account.driver_id);
  }

  const db = await getSqliteDb();
  return db.get(
    `SELECT d.* FROM drivers d
    INNER JOIN accounts a ON a.driver_id = d.id
    WHERE lower(a.email) = lower(?)`,
    [email]
  );
}

async function getLoadById(id) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('loads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM loads WHERE id = ?', [id]);
}

async function getLegById(id) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('legs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM legs WHERE id = ?', [id]);
}

async function getLegByLoadSequence(loadId, sequence) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('legs')
      .select('*')
      .eq('load_id', loadId)
      .eq('sequence', sequence)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM legs WHERE load_id = ? AND sequence = ?', [loadId, sequence]);
}

async function updateLegStatus(id, status, driverId) {
  assertStatus(status);

  if (useSupabase) {
    const updates = { status };
    if (driverId !== undefined) {
      updates.driver_id = driverId;
    }

    const { data, error } = await supabase
      .from('legs')
      .update(updates)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();

  if (driverId !== undefined) {
    await db.run('UPDATE legs SET status = ?, driver_id = ? WHERE id = ?', [status, driverId, id]);
  } else {
    await db.run('UPDATE legs SET status = ? WHERE id = ?', [status, id]);
  }

  return db.get('SELECT * FROM legs WHERE id = ?', [id]);
}

async function createLegEvent(event) {
  assertLegEventType(event.event_type);

  const payload = {
    id: event.id || crypto.randomUUID(),
    leg_id: event.leg_id,
    load_id: event.load_id,
    driver_id: event.driver_id || null,
    event_type: event.event_type,
    payload: event.payload ? JSON.stringify(event.payload) : null
  };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('leg_events')
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  await db.run(
    `INSERT INTO leg_events
    (id, leg_id, load_id, driver_id, event_type, payload)
    VALUES (?, ?, ?, ?, ?, ?)`,
    [payload.id, payload.leg_id, payload.load_id, payload.driver_id, payload.event_type, payload.payload]
  );
  return db.get('SELECT * FROM leg_events WHERE id = ?', [payload.id]);
}

async function listLegEventsByLeg(legId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('leg_events')
      .select('*')
      .eq('leg_id', legId)
      .order('created_at', { ascending: true });

    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();
  return db.all('SELECT * FROM leg_events WHERE leg_id = ? ORDER BY datetime(created_at) ASC', [legId]);
}

async function getLatestLegEvent(legId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('leg_events')
      .select('*')
      .eq('leg_id', legId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM leg_events WHERE leg_id = ? ORDER BY datetime(created_at) DESC LIMIT 1', [legId]);
}

async function upsertHandoff(handoff) {
  assertHandoffStatus(handoff.status);

  const payload = {
    id: handoff.id || crypto.randomUUID(),
    load_id: handoff.load_id,
    from_leg_id: handoff.from_leg_id,
    to_leg_id: handoff.to_leg_id,
    from_driver_id: handoff.from_driver_id || null,
    to_driver_id: handoff.to_driver_id || null,
    status: handoff.status
  };

  if (useSupabase) {
    const { data, error } = await supabase
      .from('handoffs')
      .upsert(payload, { onConflict: 'from_leg_id,to_leg_id' })
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  await db.run(
    `INSERT INTO handoffs
    (id, load_id, from_leg_id, to_leg_id, from_driver_id, to_driver_id, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(from_leg_id, to_leg_id) DO UPDATE SET
      from_driver_id = excluded.from_driver_id,
      to_driver_id = excluded.to_driver_id,
      status = excluded.status,
      updated_at = datetime('now')`,
    [
      payload.id,
      payload.load_id,
      payload.from_leg_id,
      payload.to_leg_id,
      payload.from_driver_id,
      payload.to_driver_id,
      payload.status
    ]
  );

  return db.get(
    'SELECT * FROM handoffs WHERE from_leg_id = ? AND to_leg_id = ?',
    [payload.from_leg_id, payload.to_leg_id]
  );
}

async function getHandoffByLegs(fromLegId, toLegId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('handoffs')
      .select('*')
      .eq('from_leg_id', fromLegId)
      .eq('to_leg_id', toLegId)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM handoffs WHERE from_leg_id = ? AND to_leg_id = ?', [fromLegId, toLegId]);
}

async function listHandoffsByLeg(legId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('handoffs')
      .select('*')
      .or(`from_leg_id.eq.${legId},to_leg_id.eq.${legId}`)
      .order('updated_at', { ascending: false });

    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();
  return db.all(
    'SELECT * FROM handoffs WHERE from_leg_id = ? OR to_leg_id = ? ORDER BY datetime(updated_at) DESC',
    [legId, legId]
  );
}

async function listLoads({ status, limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  if (useSupabase) {
    let query = supabase
      .from('loads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();
  const params = [];
  let sql = 'SELECT * FROM loads';

  if (status) {
    sql += ' WHERE status = ?';
    params.push(status);
  }

  sql += ' ORDER BY datetime(created_at) DESC LIMIT ?';
  params.push(safeLimit);
  return db.all(sql, params);
}

async function listLegs({ status, loadId, driverId, limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  if (useSupabase) {
    let query = supabase
      .from('legs')
      .select('*')
      .order('sequence', { ascending: true })
      .limit(safeLimit);

    if (status) {
      query = query.eq('status', status);
    }

    if (loadId) {
      query = query.eq('load_id', loadId);
    }

    if (driverId) {
      query = query.eq('driver_id', driverId);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();
  const clauses = [];
  const params = [];

  if (status) {
    clauses.push('status = ?');
    params.push(status);
  }

  if (loadId) {
    clauses.push('load_id = ?');
    params.push(loadId);
  }

  if (driverId) {
    clauses.push('driver_id = ?');
    params.push(driverId);
  }

  let sql = 'SELECT * FROM legs';
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }

  sql += ' ORDER BY sequence ASC LIMIT ?';
  params.push(safeLimit);
  return db.all(sql, params);
}

async function listLegsForDriver(driverId, { status, loadId, limit } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  if (useSupabase) {
    let query = supabase
      .from('legs')
      .select('*')
      .or(`and(driver_id.is.null,status.eq.OPEN),driver_id.eq.${driverId}`)
      .order('sequence', { ascending: true });

    if (status) query = query.eq('status', status);
    if (loadId) query = query.eq('load_id', loadId);
    query = query.limit(safeLimit);

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();

  // Base condition: unassigned OPEN legs OR this driver's legs
  let sql = `SELECT * FROM legs WHERE ((driver_id IS NULL AND status = 'OPEN') OR driver_id = ?)`;
  const params = [driverId];

  if (status) { sql += ' AND status = ?'; params.push(status); }
  if (loadId) { sql += ' AND load_id = ?'; params.push(loadId); }
  sql += ' ORDER BY sequence ASC LIMIT ?';
  params.push(safeLimit);

  return db.all(sql, params);
}

async function listLegsByLoad(loadId) {
  return listLegs({ loadId, limit: 500 });
}

async function listDrivers({ limit = 50 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 50, 200));

  if (useSupabase) {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('name', { ascending: true })
      .limit(safeLimit);

    if (error) {
      throw error;
    }

    return data || [];
  }

  const db = await getSqliteDb();
  return db.all('SELECT * FROM drivers ORDER BY name ASC LIMIT ?', [safeLimit]);
}

async function getDriverById(id) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM drivers WHERE id = ?', [id]);
}

async function getDriverByEmail(email) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .ilike('email', email)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM drivers WHERE lower(email) = lower(?)', [email]);
}

async function updateDriverLocation(driverId, { current_lat, current_lng }) {
  const lat = typeof current_lat === 'number' ? current_lat : null;
  const lng = typeof current_lng === 'number' ? current_lng : null;

  if (useSupabase) {
    const { data, error } = await supabase
      .from('drivers')
      .update({ current_lat: lat, current_lng: lng })
      .eq('id', driverId)
      .select('*')
      .maybeSingle();

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  await db.run(
    'UPDATE drivers SET current_lat = ?, current_lng = ? WHERE id = ?',
    [lat, lng, driverId]
  );

  return db.get('SELECT * FROM drivers WHERE id = ?', [driverId]);
}

async function getContactById(id) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.get('SELECT * FROM contacts WHERE id = ?', [id]);
}

async function listOpenLegsNear(lat, lng, hosHours) {
  const maxMiles = typeof hosHours === 'number' ? hosHours * 55 : null;

  if (useSupabase) {
    let query = supabase.from('legs').select('*').eq('status', 'OPEN');
    if (maxMiles !== null) {
      query = query.lte('miles', maxMiles);
    }

    const { data, error } = await query;
    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();

  if (maxMiles !== null) {
    return db.all('SELECT * FROM legs WHERE status = ? AND miles <= ?', ['OPEN', maxMiles]);
  }

  return db.all('SELECT * FROM legs WHERE status = ?', ['OPEN']);
}

async function listContactsByDriver(driverId) {
  if (useSupabase) {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('driver_id', driverId);

    if (error) {
      throw error;
    }

    return data;
  }

  const db = await getSqliteDb();
  return db.all('SELECT * FROM contacts WHERE driver_id = ?', [driverId]);
}

module.exports = {
  createLoad,
  createLegs,
  createDriver,
  createContact,
  createAccount,
  getLoadById,
  getLegById,
  getLegByLoadSequence,
  getAccountByEmail,
  getDriverByAccountEmail,
  listLoads,
  listLegs,
  listLegsForDriver,
  listLegsByLoad,
  updateLegStatus,
  createLegEvent,
  listLegEventsByLeg,
  getLatestLegEvent,
  upsertHandoff,
  getHandoffByLegs,
  listHandoffsByLeg,
  listDrivers,
  getDriverById,
  getDriverByEmail,
  updateDriverLocation,
  getContactById,
  listOpenLegsNear,
  listContactsByDriver
};
