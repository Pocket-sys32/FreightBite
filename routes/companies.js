const express = require('express');
const router = express.Router();
const {
  findByMC,
  findByDOT,
  findByName,
  getCompanyWithContracts,
  getCompanyWithContacts,
  listCompanies,
  createCompany,
  updateCompany,
} = require('../lib/queries/companies');

// GET / - List companies
router.get('/', async (req, res) => {
  try {
    const { companyType, state, limit, offset } = req.query;
    const companies = await listCompanies({ companyType, state, limit, offset });
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /search - Search companies by name
router.get('/search', async (req, res) => {
  try {
    const { name } = req.query;
    if (!name) {
      return res.status(400).json({ error: 'Query parameter "name" is required' });
    }
    const companies = await findByName(name);
    res.status(200).json(companies);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /mc/:mcNumber - Find company by MC number
router.get('/mc/:mcNumber', async (req, res) => {
  try {
    const company = await findByMC(req.params.mcNumber);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.status(200).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /dot/:dotNumber - Find company by DOT number
router.get('/dot/:dotNumber', async (req, res) => {
  try {
    const company = await findByDOT(req.params.dotNumber);
    if (!company) {
      return res.status(404).json({ error: 'Company not found' });
    }
    res.status(200).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /:id - Get company with contracts and contacts
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [withContracts, withContacts] = await Promise.all([
      getCompanyWithContracts(id),
      getCompanyWithContacts(id),
    ]);

    if (!withContracts && !withContacts) {
      return res.status(404).json({ error: 'Company not found' });
    }

    const base = withContracts || withContacts;
    const merged = {
      ...base,
      contracts: withContracts ? withContracts.contracts : [],
      contract_contacts: withContacts ? withContacts.contacts : [],
    };

    res.status(200).json(merged);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST / - Create company
router.post('/', async (req, res) => {
  try {
    const {
      name,
      mc_number,
      dot_number,
      company_type,
      address,
      city,
      state,
      zip,
      phone,
      email,
      website,
    } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Field "name" is required' });
    }
    if (!company_type) {
      return res.status(400).json({ error: 'Field "company_type" is required' });
    }

    const company = await createCompany({
      name,
      mc_number,
      dot_number,
      company_type,
      address,
      city,
      state,
      zip,
      phone,
      email,
      website,
    });

    res.status(201).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PATCH /:id - Update company
router.patch('/:id', async (req, res) => {
  try {
    const company = await updateCompany(req.params.id, req.body);
    res.status(200).json(company);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
