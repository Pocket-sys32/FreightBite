const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const STATUS_VALUES = new Set(['OPEN', 'IN_TRANSIT', 'COMPLETE']);

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
  miles NUMERIC NOT NULL,
  handoff_point TEXT,
  rate_cents INTEGER NOT NULL,
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

CREATE INDEX IF NOT EXISTS legs_load_id_idx ON legs(load_id);
CREATE INDEX IF NOT EXISTS legs_status_idx ON legs(status);
CREATE INDEX IF NOT EXISTS contacts_driver_id_idx ON contacts(driver_id);
`;

function assertStatus(status) {
  if (!STATUS_VALUES.has(status)) {
    throw new Error(`Invalid status: ${status}`);
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
  return sqliteDb;
}

async function createLoad(load) {
  const payload = {
    origin: load.origin,
    destination: load.destination,
    miles: load.miles,
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
    'INSERT INTO loads (id, origin, destination, miles, status) VALUES (?, ?, ?, ?, ?)',
    [id, payload.origin, payload.destination, payload.miles, payload.status]
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
      miles: leg.miles,
      handoff_point: leg.handoff_point || null,
      rate_cents: leg.rate_cents,
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
        (id, load_id, sequence, origin, destination, miles, handoff_point, rate_cents, status, driver_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          leg.id,
          leg.load_id,
          leg.sequence,
          leg.origin,
          leg.destination,
          leg.miles,
          leg.handoff_point,
          leg.rate_cents,
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

async function listLegs({ status, loadId, limit = 100 } = {}) {
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

  let sql = 'SELECT * FROM legs';
  if (clauses.length > 0) {
    sql += ` WHERE ${clauses.join(' AND ')}`;
  }

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
  getLoadById,
  getLegById,
  listLoads,
  listLegs,
  listLegsByLoad,
  updateLegStatus,
  listDrivers,
  getDriverById,
  getContactById,
  listOpenLegsNear,
  listContactsByDriver
};
