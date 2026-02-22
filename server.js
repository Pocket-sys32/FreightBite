require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

const express = require('express');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./server/db');
const { segmentLoad } = require('./server/segmentLoad');
const { haversineMiles, metersToMiles } = require('./server/geo');
const { supabase, supabaseAdmin } = require('./lib/supabase');

// Route modules
const documentsRouter = require('./routes/documents');
const ratesRouter = require('./routes/rates');
const companiesRouter = require('./routes/companies');

// AI modules
const { generateMatchExplanation } = require('./lib/ai/match-explanation');
const { draftBrokerEmail } = require('./lib/ai/email-drafter');
const { getRecommendation } = require('./lib/ai/whats-next');

const app = express();
app.use(express.json({ limit: '25mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Api-Key');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  return next();
});
app.use(express.static('public'));

// API routes
app.use('/api/documents', documentsRouter);
app.use('/api/rates', ratesRouter);
app.use('/api/companies', companiesRouter);

const signDriverToken = (driverId) => jwt.sign({ sub: driverId, role: 'DRIVER' }, JWT_SECRET, { expiresIn: '7d' });

const getBearerToken = (req) => {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  return header.slice('Bearer '.length).trim();
};

async function getAuthenticatedDriver(req) {
  const token = getBearerToken(req);
  if (!token) {
    return null;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.sub) {
      return null;
    }
    const driver = await db.getDriverById(payload.sub);
    return driver || null;
  } catch (error) {
    return null;
  }
}

const MAX_OUTREACH_UPLOAD_BYTES = 20 * 1024 * 1024;
const OUTREACH_DOC_TYPES = new Set(['invoice', 'bol', 'rate_sheet', 'contract', 'other']);

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || error?.details || '').toLowerCase();
  return message.includes(columnName.toLowerCase()) && message.includes('column');
}

function tryParseJsonFromStdout(stdout) {
  const text = String(stdout || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (_) {
    const line = text
      .split(/\r?\n/)
      .map((item) => item.trim())
      .reverse()
      .find((item) => item.startsWith('{') && item.endsWith('}'));
    if (!line) return null;
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }
}

function safeUploadFilename(filename) {
  const base = path.basename(String(filename || 'upload.pdf')).replace(/[^\w.\-]+/g, '_');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function runExtractor(pythonBin, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(pythonBin, args, { env });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

async function runExtractorWithFallback(args, env) {
  const venvPython = path.join(process.cwd(), 'scripts', 'pdf_extract', 'venv', 'bin', 'python');
  const candidates = fs.existsSync(venvPython) ? [venvPython, 'python3', 'python'] : ['python3', 'python'];
  let lastError = null;

  for (const pythonBin of candidates) {
    try {
      const result = await runExtractor(pythonBin, args, env);
      if (result.code === 0) {
        return { ...result, pythonBin };
      }
      lastError = new Error(result.stderr || result.stdout || `Extractor exited with code ${result.code}`);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        continue;
      }
      lastError = error;
    }
  }

  throw lastError || new Error('Unable to execute Python extractor');
}

async function upsertCompanyForDriver(sb, driverId, extracted) {
  const brokerName = String(extracted?.broker_name || '').trim();
  if (!brokerName) return null;

  let ownerColumnSupported = true;
  let query = sb
    .from('companies')
    .select('id')
    .eq('name', brokerName)
    .eq('company_type', 'broker')
    .eq('owner_driver_id', driverId)
    .limit(1)
    .maybeSingle();

  let lookup = await query;
  if (lookup.error && isMissingColumnError(lookup.error, 'owner_driver_id')) {
    ownerColumnSupported = false;
    lookup = await sb
      .from('companies')
      .select('id')
      .eq('name', brokerName)
      .eq('company_type', 'broker')
      .limit(1)
      .maybeSingle();
  }
  if (lookup.error) {
    throw lookup.error;
  }
  if (lookup.data?.id) {
    return { id: lookup.data.id, ownerColumnSupported };
  }

  const metadata = { source: 'outreach_upload', driver_uuid: driverId };
  const payload = {
    name: brokerName,
    company_type: 'broker',
    email: extracted?.broker_email || null,
    metadata,
  };
  if (ownerColumnSupported) {
    payload.owner_driver_id = driverId;
  }

  let inserted = await sb.from('companies').insert(payload).select('id').single();
  if (inserted.error && ownerColumnSupported && isMissingColumnError(inserted.error, 'owner_driver_id')) {
    ownerColumnSupported = false;
    delete payload.owner_driver_id;
    inserted = await sb.from('companies').insert(payload).select('id').single();
  }
  if (inserted.error) {
    throw inserted.error;
  }

  return { id: inserted.data.id, ownerColumnSupported };
}

async function createContractForDriver(sb, driverId, companyId, documentId, documentType, extracted, ownerColumnSupported) {
  const contractType = documentType === 'contract'
    ? 'master_agreement'
    : documentType === 'rate_sheet'
      ? 'rate_confirmation'
      : 'other';
  const effectiveDate = extracted?.invoice_date || extracted?.pickup_date || null;
  const contractPayload = {
    company_id: companyId,
    document_id: documentId || null,
    contract_type: contractType,
    status: 'active',
    effective_date: effectiveDate,
    metadata: {
      source: 'outreach_upload',
      driver_uuid: driverId,
      extracted,
    },
  };
  if (ownerColumnSupported) {
    contractPayload.owner_driver_id = driverId;
  }

  let inserted = await sb.from('contracts').insert(contractPayload).select('id').single();
  if (inserted.error && ownerColumnSupported && isMissingColumnError(inserted.error, 'owner_driver_id')) {
    delete contractPayload.owner_driver_id;
    inserted = await sb.from('contracts').insert(contractPayload).select('id').single();
  }
  if (inserted.error) {
    throw inserted.error;
  }

  return inserted.data.id;
}

async function createContractContactForDriver(sb, driverId, companyId, contractId, extracted, ownerColumnSupported) {
  const name = String(extracted?.broker_name || '').trim() || 'Broker Contact';
  const payload = {
    company_id: companyId,
    contract_id: contractId,
    name,
    role: 'broker',
    email: extracted?.broker_email || null,
    is_primary: true,
    notes: `Uploaded via outreach parser for driver ${driverId}`,
  };
  if (ownerColumnSupported) {
    payload.owner_driver_id = driverId;
  }

  let inserted = await sb.from('contract_contacts').insert(payload).select('id').single();
  if (inserted.error && ownerColumnSupported && isMissingColumnError(inserted.error, 'owner_driver_id')) {
    delete payload.owner_driver_id;
    inserted = await sb.from('contract_contacts').insert(payload).select('id').single();
  }
  if (inserted.error) {
    throw inserted.error;
  }
  return inserted.data.id;
}

async function linkRatesToDriverContract(sb, driverId, documentId, companyId, contractId, ownerColumnSupported) {
  if (!documentId || !companyId || !contractId) return 0;
  const rateUpdates = { contract_id: contractId };
  if (ownerColumnSupported) {
    rateUpdates.owner_driver_id = driverId;
  }

  let updateResult = await sb
    .from('rates')
    .update(rateUpdates)
    .eq('document_id', documentId)
    .eq('company_id', companyId)
    .select('id');

  if (updateResult.error && ownerColumnSupported && isMissingColumnError(updateResult.error, 'owner_driver_id')) {
    delete rateUpdates.owner_driver_id;
    updateResult = await sb
      .from('rates')
      .update(rateUpdates)
      .eq('document_id', documentId)
      .eq('company_id', companyId)
      .select('id');
  }
  if (updateResult.error) {
    throw updateResult.error;
  }
  return Array.isArray(updateResult.data) ? updateResult.data.length : 0;
}

async function linkExtractionToDriverData({ driverId, extracted, documentId, documentType }) {
  const summary = {
    localContactCreated: false,
    companyId: null,
    contractId: null,
    contractContactId: null,
    ratesLinked: 0,
  };

  const brokerName = String(extracted?.broker_name || '').trim();
  if (brokerName) {
    const currentContacts = await db.listContactsByDriver(driverId);
    const brokerEmail = String(extracted?.broker_email || '').trim() || null;
    const hasExisting = (currentContacts || []).some((contact) => {
      const sameName = String(contact.broker_name || '').trim().toLowerCase() === brokerName.toLowerCase();
      const sameEmail = brokerEmail
        ? String(contact.broker_email || '').trim().toLowerCase() === brokerEmail.toLowerCase()
        : false;
      return sameName || sameEmail;
    });

    if (!hasExisting) {
      await db.createContact({
        driver_id: driverId,
        broker_name: brokerName,
        broker_email: brokerEmail,
        last_worked_together: new Date().toISOString().slice(0, 10),
      });
      summary.localContactCreated = true;
    }
  }

  const sb = supabaseAdmin || supabase;
  if (!sb || !brokerName) {
    return summary;
  }

  const company = await upsertCompanyForDriver(sb, driverId, extracted);
  if (!company?.id) {
    return summary;
  }
  summary.companyId = company.id;

  const contractId = await createContractForDriver(
    sb,
    driverId,
    company.id,
    documentId,
    documentType,
    extracted,
    company.ownerColumnSupported
  );
  summary.contractId = contractId;

  const contractContactId = await createContractContactForDriver(
    sb,
    driverId,
    company.id,
    contractId,
    extracted,
    company.ownerColumnSupported
  );
  summary.contractContactId = contractContactId;

  summary.ratesLinked = await linkRatesToDriverContract(
    sb,
    driverId,
    documentId,
    company.id,
    contractId,
    company.ownerColumnSupported
  );

  return summary;
}

// AI dispatcher endpoints
app.post('/api/auth/register-driver', async (req, res) => {
  const {
    name,
    email,
    password,
    currentLat,
    currentLng,
    homeLat,
    homeLng,
    hosRemainingHours
  } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'name, email, and password are required' });
  }

  if (String(password).length < 8) {
    return res.status(400).json({ error: 'password must be at least 8 characters' });
  }

  try {
    const existingAccount = await db.getAccountByEmail(email);
    if (existingAccount) {
      return res.status(409).json({ error: 'account already exists for this email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const driver = await db.createDriver({
      name,
      email,
      current_lat: typeof currentLat === 'number' ? currentLat : null,
      current_lng: typeof currentLng === 'number' ? currentLng : null,
      hos_remaining_hours: typeof hosRemainingHours === 'number' ? hosRemainingHours : 11,
      home_lat: typeof homeLat === 'number' ? homeLat : null,
      home_lng: typeof homeLng === 'number' ? homeLng : null
    });

    await db.createAccount({
      driver_id: driver.id,
      email,
      password_hash: passwordHash
    });

    const token = signDriverToken(driver.id);
    return res.status(201).json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to create account' });
  }
});

app.post('/api/auth/login-driver', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }

  try {
    const account = await db.getAccountByEmail(email);
    if (!account) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const ok = await bcrypt.compare(String(password), account.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const driver = await db.getDriverById(account.driver_id);
    if (!driver) {
      return res.status(401).json({ error: 'invalid credentials' });
    }

    const token = signDriverToken(driver.id);
    return res.json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to login' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const driver = await getAuthenticatedDriver(req);
  if (!driver) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  return res.json({ driver });
});

app.post('/api/auth/oauth-session', async (req, res) => {
  const { email, name, currentLat, currentLng, homeLat, homeLng } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'email is required' });
  }

  try {
    let driver = await db.getDriverByEmail(String(email));
    if (!driver) {
      driver = await db.createDriver({
        name: name || String(email).split('@')[0] || 'Driver',
        email,
        current_lat: typeof currentLat === 'number' ? currentLat : null,
        current_lng: typeof currentLng === 'number' ? currentLng : null,
        hos_remaining_hours: 11,
        home_lat: typeof homeLat === 'number' ? homeLat : null,
        home_lng: typeof homeLng === 'number' ? homeLng : null
      });
    }

    const token = signDriverToken(driver.id);
    return res.json({ token, driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'failed to create oauth session' });
  }
});

app.post('/api/ai/match-explanation', async (req, res) => {
  try {
    const { leg, driver } = req.body;
    if (!leg || !driver) return res.status(400).json({ error: 'leg and driver are required' });
    const explanation = await generateMatchExplanation({ leg, driver });
    res.json({ explanation });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/draft-email', async (req, res) => {
  try {
    const { driver, broker } = req.body;
    if (!driver || !broker) return res.status(400).json({ error: 'driver and broker are required' });
    const email = await draftBrokerEmail({ driver, broker });
    res.json(email);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/whats-next', async (req, res) => {
  try {
    const { driver, nearbyLoads } = req.body;
    if (!driver) return res.status(400).json({ error: 'driver is required' });
    const recommendation = await getRecommendation({ driver, nearbyLoads: nearbyLoads || [] });
    res.json(recommendation);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/outreach/extract-upload', async (req, res) => {
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const {
    filename,
    contentBase64,
    documentType = 'contract',
    useLlm = false,
  } = req.body || {};

  if (!filename || !contentBase64) {
    return res.status(400).json({ error: 'filename and contentBase64 are required' });
  }
  if (!OUTREACH_DOC_TYPES.has(documentType)) {
    return res.status(400).json({ error: `Invalid documentType. Allowed: ${Array.from(OUTREACH_DOC_TYPES).join(', ')}` });
  }

  let fileBuffer;
  try {
    const cleanedBase64 = String(contentBase64)
      .replace(/^data:application\/pdf;base64,/i, '')
      .replace(/\s+/g, '');
    fileBuffer = Buffer.from(cleanedBase64, 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid base64 payload' });
  }

  if (!fileBuffer || fileBuffer.length === 0) {
    return res.status(400).json({ error: 'Uploaded file is empty' });
  }
  if (fileBuffer.length > MAX_OUTREACH_UPLOAD_BYTES) {
    return res.status(413).json({ error: `File is too large. Max ${Math.round(MAX_OUTREACH_UPLOAD_BYTES / (1024 * 1024))}MB` });
  }
  if (fileBuffer.subarray(0, 4).toString() !== '%PDF') {
    return res.status(400).json({ error: 'Only PDF uploads are supported' });
  }

  const tempDir = path.join(os.tmpdir(), 'freightbite-outreach-uploads');
  const tempFilePath = path.join(
    tempDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${safeUploadFilename(filename)}`
  );

  try {
    await fsp.mkdir(tempDir, { recursive: true });
    await fsp.writeFile(tempFilePath, fileBuffer);

    const scriptPath = path.join(process.cwd(), 'scripts', 'pdf_extract', 'extract_invoice.py');
    const args = [
      scriptPath,
      tempFilePath,
      '--user-id',
      authDriver.id,
      '--document-type',
      documentType,
      '--json-output',
    ];
    if (useLlm) {
      args.push('--use-llm');
    }

    const extraction = await runExtractorWithFallback(args, {
      ...process.env,
      SUPABASE_URL: process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    });

    const parsed = tryParseJsonFromStdout(extraction.stdout);
    const firstResult = parsed?.results?.[0];
    if (!firstResult) {
      return res.status(500).json({
        error: 'Extractor returned no structured result',
        details: extraction.stderr || extraction.stdout || null,
      });
    }
    if (firstResult.error) {
      return res.status(422).json({ error: firstResult.error });
    }

    const linkage = await linkExtractionToDriverData({
      driverId: authDriver.id,
      extracted: firstResult.extracted || {},
      documentId: firstResult.document_id || null,
      documentType,
    });

    return res.status(201).json({
      filename: firstResult.filename || filename,
      documentId: firstResult.document_id || null,
      extracted: firstResult.extracted || null,
      linked: linkage,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to process upload',
      details: error?.message || String(error),
    });
  } finally {
    try {
      await fsp.unlink(tempFilePath);
    } catch (_) {
      // best-effort temp file cleanup
    }
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
const legEvents = new EventEmitter();
const JWT_SECRET = process.env.JWT_SECRET || 'freightbite-dev-secret-change-me';
const ENABLE_DEMO_SEED = process.env.ENABLE_DEMO_SEED === 'true';
const HANDOFF_COMPLETION_RADIUS_MILES = Number.isFinite(Number(process.env.HANDOFF_COMPLETION_RADIUS_MILES))
  ? Number(process.env.HANDOFF_COMPLETION_RADIUS_MILES)
  : 0.25;

function emitLegUpdate(leg) {
  const payload = {
    legId: leg.id,
    loadId: leg.load_id || null,
    driverId: leg.driver_id || null,
    status: leg.status,
    updatedAt: new Date().toISOString()
  };

  legEvents.emit('leg.update', payload);
  io.emit('leg:update', payload);
  if (leg.status === 'COMPLETE') {
    io.emit('leg.completed', payload);
  }
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Driver joins their personal room upon auth
  socket.on('auth:join', (data) => {
    const { token } = data || {};
    if (!token) return;
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      if (payload?.sub) {
        socket.join(`driver:${payload.sub}`);
        socket.driverId = payload.sub;
        console.log(`Driver ${payload.sub} joined room driver:${payload.sub}`);
      }
    } catch (e) {
      console.error('Socket auth failed:', e.message);
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

/** POST /push-order — push a dummy order to all connected mobile clients */
app.post('/push-order', async (req, res) => {
  const dummyOrder = {
    id: `ORD-${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toISOString(),
    items: [
      { sku: 'FB-001', name: 'Widget A', quantity: 2, unit: 'pallet' },
      { sku: 'FB-002', name: 'Widget B', quantity: 1, unit: 'case' }
    ],
    destination: { address: '123 Freight St', city: 'Logistics City', zip: '12345' },
    notes: 'Dummy order pushed from server'
  };

  const loadDestination = `${dummyOrder.destination.address}, ${dummyOrder.destination.city} ${dummyOrder.destination.zip}`;
  try {
    const load = await db.createLoad({
      origin: 'Warehouse A',
      destination: loadDestination,
      miles: 120,
      status: 'OPEN'
    });

    await db.createLegs([
      {
        load_id: load.id,
        sequence: 1,
        origin: 'Warehouse A',
        destination: loadDestination,
        miles: 120,
        handoff_point: 'Hub 1',
        rate_cents: 125000,
        status: 'OPEN'
      }
    ]);
  } catch (error) {
    console.error('Failed to persist dummy load:', error.message);
  }

  io.emit('order', dummyOrder);
  console.log('Pushed order to clients:', dummyOrder.id);

  res.json({ ok: true, orderId: dummyOrder.id });
});

// --- Relay Haul / FreightBite backend (from relay_haul_1day.md) ---

/** GET /api/loads — list loads (optional ?status=) */
app.get('/api/loads', async (req, res) => {
  try {
    const status = req.query.status ? normalizeStatus(req.query.status) : null;
    if (req.query.status && !status) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const loads = await db.listLoads({ status, limit: req.query.limit });
    return res.json((loads || []).map(hydrateLoad));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list loads' });
  }
});

/** GET /api/loads/:id — load with legs */
app.get('/api/loads/:id', async (req, res) => {
  try {
    const load = await db.getLoadById(req.params.id);
    if (!load) {
      return res.status(404).json({ error: 'Load not found' });
    }

    const legs = await db.listLegsByLoad(load.id);
    return res.json({
      ...hydrateLoad(load),
      legs: (legs || []).map(hydrateLeg).sort((a, b) => a.sequence - b.sequence)
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch load' });
  }
});

/** GET /api/legs — list legs (e.g. ?status=open for driver) */
app.get('/api/legs', async (req, res) => {
  try {
    const status = req.query.status ? normalizeStatus(req.query.status) : null;
    if (req.query.status && !status) {
      return res.status(400).json({ error: 'Invalid status filter' });
    }

    const authDriver = await getAuthenticatedDriver(req);
    let legs;

    if (authDriver) {
      // Authenticated driver: only see OPEN legs + their own
      legs = await db.listLegsForDriver(authDriver.id, {
        status,
        loadId: req.query.loadId || req.query.load_id,
        limit: req.query.limit
      });
    } else {
      // Unauthenticated (shipper/admin): see all legs
      legs = await db.listLegs({
        status,
        loadId: req.query.loadId || req.query.load_id,
        driverId: req.query.driverId || req.query.driver_id,
        limit: req.query.limit
      });
    }

    return res.json((legs || []).map(hydrateLeg));
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list legs' });
  }
});

/** GET /api/drivers — list drivers */
app.get('/api/drivers', async (req, res) => {
  try {
    const drivers = await db.listDrivers({ limit: req.query.limit });
    return res.json(drivers || []);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list drivers' });
  }
});

/** GET /api/drivers/:id — get one driver */
app.get('/api/drivers/:id', async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }
    return res.json(driver);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch driver' });
  }
});

/** GET /api/drivers/:id/contacts — list contacts for driver */
app.get('/api/drivers/:id/contacts', async (req, res) => {
  try {
    const driver = await db.getDriverById(req.params.id);
    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const contacts = await db.listContactsByDriver(req.params.id);
    return res.json(contacts || []);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list contacts' });
  }
});

/** PATCH /api/drivers/me/location — live GPS update for authenticated driver */
app.patch('/api/drivers/me/location', async (req, res) => {
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Invalid GPS coordinates' });
  }

  try {
    const driver = await db.updateDriverLocation(authDriver.id, {
      current_lat: lat,
      current_lng: lng
    });

    if (!driver) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const payload = {
      driverId: driver.id,
      lat,
      lng,
      accuracy: typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
      updatedAt: new Date().toISOString()
    };

    io.emit('driver:location', payload);
    io.to(`driver:${driver.id}`).emit('driver:location', payload);

    return res.json({ driver });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update driver location' });
  }
});

const isValidLocation = (location) =>
  location
  && typeof location.lat === 'number'
  && typeof location.lng === 'number';

const safeParseJson = (value) => {
  if (typeof value !== 'string') {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
};

const hydrateLoad = (load) => ({
  ...load,
  origin: safeParseJson(load.origin),
  destination: safeParseJson(load.destination)
});

const hydrateLeg = (leg) => ({
  ...leg,
  origin: safeParseJson(leg.origin),
  destination: safeParseJson(leg.destination),
  handoff_point: safeParseJson(leg.handoff_point)
});

const parseEventPayload = (event) => {
  if (!event) return event;
  const rawPayload = safeParseJson(event.payload);
  return {
    ...event,
    payload: rawPayload
  };
};

const toCoordinatePoint = (value, fallbackLabel = 'Unknown') => {
  const parsed = safeParseJson(value);
  if (parsed && typeof parsed === 'object' && typeof parsed.lat === 'number' && typeof parsed.lng === 'number') {
    return {
      lat: parsed.lat,
      lng: parsed.lng,
      label: parsed.label || parsed.name || fallbackLabel
    };
  }
  return null;
};

const buildDirectionsUrl = (fromPoint, toPoint) =>
  `http://router.project-osrm.org/route/v1/driving/${fromPoint.lng},${fromPoint.lat};${toPoint.lng},${toPoint.lat}?overview=full&steps=true&geometries=geojson`;

async function fetchDirections(fromPoint, toPoint) {
  const response = await fetch(buildDirectionsUrl(fromPoint, toPoint));
  if (!response.ok) {
    throw new Error(`OSRM directions request failed (${response.status})`);
  }

  const payload = await response.json();
  const route = payload?.routes?.[0];
  if (!route) {
    throw new Error('OSRM returned no route for directions');
  }

  const legs = Array.isArray(route.legs) ? route.legs : [];
  const steps = [];
  for (const leg of legs) {
    for (const step of leg.steps || []) {
      steps.push({
        distanceMiles: Number(metersToMiles(step.distance || 0).toFixed(2)),
        durationMinutes: Number(((step.duration || 0) / 60).toFixed(1)),
        name: step.name || '',
        maneuver: step.maneuver?.type || 'turn',
        instruction: `${step.maneuver?.modifier || step.maneuver?.type || 'continue'} ${step.name || ''}`.trim(),
        location: step.maneuver?.location
          ? { lng: step.maneuver.location[0], lat: step.maneuver.location[1] }
          : null
      });
    }
  }

  return {
    distanceMiles: Number(metersToMiles(route.distance || 0).toFixed(2)),
    durationMinutes: Number(((route.duration || 0) / 60).toFixed(1)),
    geometry: route.geometry?.coordinates || [],
    steps
  };
}

async function buildLegWorkflow(leg) {
  const previousLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence - 1);
  const nextLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence + 1);
  const events = await db.listLegEventsByLeg(leg.id);
  const handoffs = await db.listHandoffsByLeg(leg.id);
  const latestEvent = events.length > 0 ? parseEventPayload(events[events.length - 1]) : null;

  let phase = 'UNASSIGNED';
  if (leg.status === 'OPEN') {
    phase = 'OPEN';
  } else if (latestEvent?.event_type) {
    phase = latestEvent.event_type;
  } else if (leg.status === 'IN_TRANSIT') {
    phase = 'ASSIGNED';
  } else if (leg.status === 'COMPLETE') {
    phase = 'HANDOFF_COMPLETE';
  }

  return {
    phase,
    latestEvent,
    events: events.map(parseEventPayload),
    previousLeg: previousLeg ? hydrateLeg(previousLeg) : null,
    nextLeg: nextLeg ? hydrateLeg(nextLeg) : null,
    handoffs: handoffs || []
  };
}

const VALID_STATUSES = new Set(['OPEN', 'IN_TRANSIT', 'COMPLETE']);
const normalizeStatus = (value) => {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const upper = value.toUpperCase();
  if (upper === 'COMPLETED') {
    return 'COMPLETE';
  }

  return VALID_STATUSES.has(upper) ? upper : null;
};

/** POST /api/loads/submit — submit a load and segment into relay legs */
app.post('/api/loads/submit', async (req, res) => {
  const { origin, destination } = req.body || {};

  if (!isValidLocation(origin) || !isValidLocation(destination)) {
    return res.status(400).json({ error: 'origin and destination with lat/lng are required.' });
  }

  try {
    const { totalMiles, legs } = await segmentLoad(origin, destination);
    const loadRecord = await db.createLoad({
      origin: JSON.stringify(origin),
      destination: JSON.stringify(destination),
      miles: totalMiles,
      status: 'OPEN'
    });

    const legRecords = await db.createLegs(
      legs.map((leg) => ({
        load_id: loadRecord.id,
        sequence: leg.sequence,
        origin: JSON.stringify(leg.origin),
        destination: JSON.stringify(leg.destination),
        miles: leg.miles,
        handoff_point: JSON.stringify(leg.handoff_point),
        rate_cents: 0,
        status: leg.status,
        driver_id: null,
        origin_address: leg.origin_address || null,
        destination_address: leg.destination_address || null
      }))
    );

    const orderedLegs = (legRecords || []).sort((a, b) => a.sequence - b.sequence);

    return res.json({
      load: hydrateLoad(loadRecord),
      legs: orderedLegs.map(hydrateLeg)
    });
  } catch (error) {
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Failed to submit load.' });
  }
});

const resolveDriverId = async (req) => {
  if (req.body?.driverId || req.body?.driver_id) {
    return req.body?.driverId || req.body?.driver_id;
  }
  const authDriver = await getAuthenticatedDriver(req);
  return authDriver?.id || null;
};

/** GET /api/legs/:id/workflow — lifecycle + handoff linkage */
app.get('/api/legs/:id/workflow', async (req, res) => {
  try {
    const leg = await db.getLegById(req.params.id);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    const workflow = await buildLegWorkflow(leg);
    return res.json({
      leg: hydrateLeg(leg),
      workflow
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch leg workflow', details: error.message });
  }
});

/** GET /api/legs/:id/directions — route from current driver location to leg destination */
app.get('/api/legs/:id/directions', async (req, res) => {
  try {
    const leg = await db.getLegById(req.params.id);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    const driverId = req.query.driverId || req.query.driver_id || leg.driver_id;
    const driver = driverId ? await db.getDriverById(driverId) : null;
    const originPoint = toCoordinatePoint(leg.origin, 'Leg origin');
    const destinationPoint = toCoordinatePoint(leg.destination, 'Leg destination');
    if (!destinationPoint || !originPoint) {
      return res.status(400).json({ error: 'Leg does not contain route coordinates' });
    }

    const fromPoint = driver && typeof driver.current_lat === 'number' && typeof driver.current_lng === 'number'
      ? { lat: driver.current_lat, lng: driver.current_lng, label: driver.name || 'Current location' }
      : originPoint;

    const directions = await fetchDirections(fromPoint, destinationPoint);
    return res.json({
      legId: leg.id,
      from: fromPoint,
      to: destinationPoint,
      directions
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch directions', details: error.message });
  }
});

/** POST /api/legs/:id/accept — claim leg (handshake begins) */
app.post('/api/legs/:id/accept', async (req, res) => {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) {
      return res.status(404).json({ error: 'Leg not found' });
    }

    if (leg.status !== 'OPEN') {
      return res.status(409).json({ error: 'Leg is not open' });
    }

    const updatedLeg = await db.updateLegStatus(legId, 'IN_TRANSIT', driverId);
    await db.createLegEvent({
      leg_id: updatedLeg.id,
      load_id: updatedLeg.load_id,
      driver_id: driverId,
      event_type: 'ASSIGNED',
      payload: { note: 'Leg claimed by driver' }
    });

    const previousLeg = await db.getLegByLoadSequence(updatedLeg.load_id, updatedLeg.sequence - 1);
    if (previousLeg && previousLeg.driver_id) {
      const status = previousLeg.status === 'COMPLETE' ? 'READY' : 'PENDING';
      await db.upsertHandoff({
        load_id: updatedLeg.load_id,
        from_leg_id: previousLeg.id,
        to_leg_id: updatedLeg.id,
        from_driver_id: previousLeg.driver_id,
        to_driver_id: driverId,
        status
      });
    }

    emitLegUpdate(updatedLeg);
    const workflow = await buildLegWorkflow(updatedLeg);
    return res.json({ leg: hydrateLeg(updatedLeg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to accept leg', details: error.message });
  }
});

/** POST /api/legs/:id/start-route — driver starts navigation */
app.post('/api/legs/:id/start-route', async (req, res) => {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const previousLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence - 1);
    if (previousLeg && previousLeg.status !== 'COMPLETE') {
      return res.status(409).json({ error: 'Cannot start route until previous handoff is complete' });
    }

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'START_ROUTE',
      payload: { startedAt: new Date().toISOString() }
    });
    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to start route', details: error.message });
  }
});

/** POST /api/legs/:id/pause-route — driver pauses active driving (e.g., food break) */
app.post('/api/legs/:id/pause-route', async (req, res) => {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const latest = await db.getLatestLegEvent(leg.id);
    const latestType = latest?.event_type || '';
    if (latestType === 'PAUSE_ROUTE') {
      return res.status(409).json({ error: 'Route is already paused' });
    }
    if (!['START_ROUTE', 'AUTO_START_ROUTE', 'RESUME_ROUTE'].includes(latestType)) {
      return res.status(409).json({ error: 'Cannot pause until route has started' });
    }

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'PAUSE_ROUTE',
      payload: { pausedAt: new Date().toISOString(), reason: req.body?.reason || 'break' }
    });

    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to pause route', details: error.message });
  }
});

/** POST /api/legs/:id/resume-route — driver resumes an already paused route */
app.post('/api/legs/:id/resume-route', async (req, res) => {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const latest = await db.getLatestLegEvent(leg.id);
    const latestType = latest?.event_type || '';
    if (latestType !== 'PAUSE_ROUTE') {
      return res.status(409).json({ error: 'Route is not paused' });
    }

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'RESUME_ROUTE',
      payload: { resumedAt: new Date().toISOString() }
    });

    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to resume route', details: error.message });
  }
});

/** POST /api/legs/:id/arrive — driver arrived at destination/handoff */
app.post('/api/legs/:id/arrive', async (req, res) => {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    await db.createLegEvent({
      leg_id: leg.id,
      load_id: leg.load_id,
      driver_id: driverId,
      event_type: 'ARRIVED',
      payload: { arrivedAt: new Date().toISOString() }
    });

    const nextLeg = await db.getLegByLoadSequence(leg.load_id, leg.sequence + 1);
    if (nextLeg && nextLeg.driver_id) {
      await db.upsertHandoff({
        load_id: leg.load_id,
        from_leg_id: leg.id,
        to_leg_id: nextLeg.id,
        from_driver_id: driverId,
        to_driver_id: nextLeg.driver_id,
        status: 'READY'
      });
      await db.createLegEvent({
        leg_id: nextLeg.id,
        load_id: nextLeg.load_id,
        driver_id: nextLeg.driver_id,
        event_type: 'HANDOFF_READY',
        payload: { fromLegId: leg.id, fromDriverId: driverId }
      });
      emitLegUpdate(nextLeg);
      io.to(`driver:${nextLeg.driver_id}`).emit('leg:handoff-ready', {
        legId: nextLeg.id,
        loadId: nextLeg.load_id,
        fromLegId: leg.id,
        message: 'Driver has arrived at handoff point. Prepare for handoff.'
      });
    }

    emitLegUpdate(leg);
    const workflow = await buildLegWorkflow(leg);
    return res.json({ leg: hydrateLeg(leg), workflow });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to mark arrival', details: error.message });
  }
});

async function finishHandoff(req, res) {
  const legId = req.params.id;
  const authDriver = await getAuthenticatedDriver(req);
  if (!authDriver) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const driverId = authDriver.id;
  let currentDriver = authDriver;

  try {
    const leg = await db.getLegById(legId);
    if (!leg) return res.status(404).json({ error: 'Leg not found' });
    if (leg.driver_id !== driverId) return res.status(403).json({ error: 'Driver does not own this leg' });
    if (leg.status !== 'IN_TRANSIT') return res.status(409).json({ error: 'Leg is not active' });

    const latInput = req.body?.currentLat ?? req.body?.lat;
    const lngInput = req.body?.currentLng ?? req.body?.lng;
    if (typeof latInput === 'number' && typeof lngInput === 'number') {
      if (!Number.isFinite(latInput) || !Number.isFinite(lngInput) || latInput < -90 || latInput > 90 || lngInput < -180 || lngInput > 180) {
        return res.status(400).json({ error: 'Invalid GPS coordinates provided for handoff completion' });
      }

      const updatedDriver = await db.updateDriverLocation(driverId, { current_lat: latInput, current_lng: lngInput });
      if (updatedDriver) {
        currentDriver = updatedDriver;
        const payload = {
          driverId,
          lat: latInput,
          lng: lngInput,
          accuracy: typeof req.body?.accuracy === 'number' ? req.body.accuracy : null,
          updatedAt: new Date().toISOString()
        };
        io.emit('driver:location', payload);
        io.to(`driver:${driverId}`).emit('driver:location', payload);
      }
    }

    const destinationPoint = toCoordinatePoint(leg.destination, 'Leg destination');
    if (!destinationPoint) {
      return res.status(400).json({ error: 'Leg destination coordinates are missing' });
    }
    if (typeof currentDriver.current_lat !== 'number' || typeof currentDriver.current_lng !== 'number') {
      return res.status(409).json({
        error: 'Live GPS required before finishing handoff',
        details: 'Enable location sharing and wait for GPS fix.'
      });
    }

    const milesAway = haversineMiles(
      { lat: currentDriver.current_lat, lng: currentDriver.current_lng },
      { lat: destinationPoint.lat, lng: destinationPoint.lng }
    );
    if (milesAway > HANDOFF_COMPLETION_RADIUS_MILES) {
      return res.status(409).json({
        error: 'Too far from drop zone to finish handoff',
        details: `Driver is ${milesAway.toFixed(2)} miles away. Move within ${HANDOFF_COMPLETION_RADIUS_MILES.toFixed(2)} miles.`,
        proximity: {
          milesAway: Number(milesAway.toFixed(3)),
          requiredMiles: Number(HANDOFF_COMPLETION_RADIUS_MILES.toFixed(3))
        }
      });
    }

    const completedLeg = await db.updateLegStatus(legId, 'COMPLETE');
    await db.createLegEvent({
      leg_id: completedLeg.id,
      load_id: completedLeg.load_id,
      driver_id: driverId,
      event_type: 'HANDOFF_COMPLETE',
      payload: { completedAt: new Date().toISOString() }
    });

    let autoStartedNextLeg = null;
    const nextLeg = await db.getLegByLoadSequence(completedLeg.load_id, completedLeg.sequence + 1);
    if (nextLeg && nextLeg.driver_id) {
      await db.upsertHandoff({
        load_id: completedLeg.load_id,
        from_leg_id: completedLeg.id,
        to_leg_id: nextLeg.id,
        from_driver_id: driverId,
        to_driver_id: nextLeg.driver_id,
        status: 'COMPLETE'
      });

      await db.createLegEvent({
        leg_id: nextLeg.id,
        load_id: nextLeg.load_id,
        driver_id: nextLeg.driver_id,
        event_type: 'HANDOFF_NOTIFIED',
        payload: JSON.stringify({
          completedLegId: completedLeg.id,
          completedByDriverId: driverId,
          notifiedAt: new Date().toISOString()
        })
      });

      if (nextLeg.status === 'IN_TRANSIT') {
        await db.createLegEvent({
          leg_id: nextLeg.id,
          load_id: nextLeg.load_id,
          driver_id: nextLeg.driver_id,
          event_type: 'AUTO_START_ROUTE',
          payload: { triggeredByLegId: completedLeg.id }
        });
        autoStartedNextLeg = nextLeg;
      }

      io.to(`driver:${nextLeg.driver_id}`).emit('leg:handoff-ready', {
        legId: nextLeg.id,
        loadId: nextLeg.load_id,
        fromLegId: completedLeg.id,
        message: 'Previous leg completed. Your leg is ready to start.'
      });
    }

    emitLegUpdate(completedLeg);
    if (autoStartedNextLeg) emitLegUpdate(autoStartedNextLeg);
    const workflow = await buildLegWorkflow(completedLeg);
    return res.json({
      leg: hydrateLeg(completedLeg),
      workflow,
      autoStartedNextLeg: autoStartedNextLeg ? hydrateLeg(autoStartedNextLeg) : null
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to finish handoff', details: error.message });
  }
}

/** POST /api/legs/:id/handoff — complete handoff and finish leg */
app.post('/api/legs/:id/handoff', finishHandoff);

/** POST /api/legs/:id/complete — backward-compatible alias */
app.post('/api/legs/:id/complete', finishHandoff);

legEvents.on('leg.update', (payload) => {
  console.log('Leg update event:', payload.legId, payload.status);
});

async function ensureDemoData() {
  try {
    const existingDriver = await db.getDriverByEmail('alex.rivera@example.com');
    const demoDriver = existingDriver || await db.createDriver({
      name: 'Alex Rivera',
      email: 'alex.rivera@example.com',
      current_lat: 41.8781,
      current_lng: -87.6298,
      hos_remaining_hours: 11,
      home_lat: 39.7392,
      home_lng: -104.9903
    });

    const existingAccount = await db.getAccountByEmail('alex.rivera@example.com');
    if (!existingAccount) {
      const passwordHash = await bcrypt.hash('demo12345', 10);
      await db.createAccount({
        driver_id: demoDriver.id,
        email: 'alex.rivera@example.com',
        password_hash: passwordHash
      });
    }

    const existingContacts = await db.listContactsByDriver(demoDriver.id);
    if (!existingContacts || existingContacts.length === 0) {
      await db.createContact({
        driver_id: demoDriver.id,
        broker_name: 'Midwest Freight Co',
        broker_email: 'dispatch@midwestfreight.example',
        last_worked_together: '2026-01-15'
      });
    }

    console.log('Seeded demo driver/contact/account for local development');
  } catch (error) {
    console.error('Failed to seed demo data:', error.message);
  }
}

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
  console.log('Socket.io ready for mobile clients');
  console.log(`Trigger push: POST http://localhost:${PORT}/push-order or run: npm run push-order`);
  if (ENABLE_DEMO_SEED) {
    void ensureDemoData();
  } else {
    console.log('Demo seed disabled. Set ENABLE_DEMO_SEED=true to enable local sample records.');
  }
});
