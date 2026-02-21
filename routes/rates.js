const express = require('express');
const router = express.Router();
const {
  findRatesByLane,
  findRatesByCompany,
  getBestRate,
  createRate,
  searchRates,
} = require('../lib/queries/rates');

// GET /search - Search rates with flexible filters
router.get('/search', async (req, res) => {
  try {
    const {
      originCity,
      originState,
      destCity,
      destState,
      equipmentType,
      rateType,
      minAmount,
      maxAmount,
      companyId,
    } = req.query;

    const results = await searchRates({
      originCity,
      originState,
      destCity,
      destState,
      equipmentType,
      rateType,
      minAmount,
      maxAmount,
      companyId,
    });

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /lane - Find rates by lane (originState + destState required)
router.get('/lane', async (req, res) => {
  try {
    const { originState, destState, equipmentType, limit } = req.query;

    if (!originState || !destState) {
      return res
        .status(400)
        .json({ error: 'originState and destState are required' });
    }

    const options = {};
    if (equipmentType !== undefined) options.equipmentType = equipmentType;
    if (limit !== undefined) options.limit = limit;

    const results = await findRatesByLane(originState, destState, options);

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /best - Get best rate for a lane + equipment type
router.get('/best', async (req, res) => {
  try {
    const { originState, destState, equipmentType } = req.query;

    if (!originState || !destState || !equipmentType) {
      return res
        .status(400)
        .json({ error: 'originState, destState, and equipmentType are required' });
    }

    const rate = await getBestRate(originState, destState, equipmentType);

    if (!rate) {
      return res.status(404).json({ error: 'No rate found for the given criteria' });
    }

    return res.status(200).json(rate);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /company/:companyId - Get rates for a specific company
router.get('/company/:companyId', async (req, res) => {
  try {
    const { companyId } = req.params;
    const { activeOnly, limit } = req.query;

    const options = {};
    if (activeOnly !== undefined) options.activeOnly = activeOnly === 'true';
    if (limit !== undefined) options.limit = limit;

    const results = await findRatesByCompany(companyId, options);

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST / - Create a new rate
router.post('/', async (req, res) => {
  try {
    const {
      company_id,
      origin_city,
      origin_state,
      destination_city,
      destination_state,
      rate_type,
      rate_amount,
    } = req.body;

    if (
      !company_id ||
      !origin_city ||
      !origin_state ||
      !destination_city ||
      !destination_state ||
      !rate_type ||
      rate_amount === undefined ||
      rate_amount === null
    ) {
      return res.status(400).json({
        error:
          'company_id, origin_city, origin_state, destination_city, destination_state, rate_type, and rate_amount are required',
      });
    }

    const rate = await createRate(req.body);

    return res.status(201).json(rate);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
