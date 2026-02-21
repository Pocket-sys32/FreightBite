const { supabase } = require('../supabase');

/**
 * Find rates by origin/destination state.
 * @param {string} originState
 * @param {string} destState
 * @param {object} options
 * @param {string} [options.equipmentType]
 * @param {boolean} [options.activeOnly=true]
 * @param {number} [options.limit=20]
 * @returns {Promise<object[]>}
 */
async function findRatesByLane(originState, destState, options = {}) {
  const { equipmentType, activeOnly = true, limit = 20 } = options;

  let query = supabase
    .from('rates')
    .select('*, companies(name)')
    .eq('origin_state', originState)
    .eq('destination_state', destState)
    .limit(limit);

  if (equipmentType) {
    query = query.eq('equipment_type', equipmentType);
  }

  if (activeOnly) {
    const today = new Date().toISOString().split('T')[0];
    query = query.gte('expiration_date', today);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get all rates for a company.
 * @param {string} companyId
 * @param {object} options
 * @param {boolean} [options.activeOnly=true]
 * @param {number} [options.limit=50]
 * @returns {Promise<object[]>}
 */
async function findRatesByCompany(companyId, options = {}) {
  const { activeOnly = true, limit = 50 } = options;

  let query = supabase
    .from('rates')
    .select('*, companies(name)')
    .eq('company_id', companyId)
    .limit(limit);

  if (activeOnly) {
    const today = new Date().toISOString().split('T')[0];
    query = query.gte('expiration_date', today);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Find the cheapest active rate for a lane + equipment combination.
 * @param {string} originState
 * @param {string} destState
 * @param {string} equipmentType
 * @returns {Promise<object|null>}
 */
async function getBestRate(originState, destState, equipmentType) {
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('rates')
    .select('*, companies(name)')
    .eq('origin_state', originState)
    .eq('destination_state', destState)
    .eq('equipment_type', equipmentType)
    .gte('expiration_date', today)
    .order('rate_amount', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Insert a new rate record.
 * @param {object} rateData
 * @returns {Promise<object>}
 */
async function createRate(rateData) {
  const { data, error } = await supabase
    .from('rates')
    .insert(rateData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Flexible rate search with optional filters.
 * @param {object} query
 * @param {string} [query.originCity]
 * @param {string} [query.originState]
 * @param {string} [query.destCity]
 * @param {string} [query.destState]
 * @param {string} [query.equipmentType]
 * @param {string} [query.rateType]
 * @param {number} [query.minAmount]
 * @param {number} [query.maxAmount]
 * @param {string} [query.companyId]
 * @returns {Promise<object[]>}
 */
async function searchRates(query) {
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
  } = query;

  let dbQuery = supabase.from('rates').select('*, companies(name)');

  if (originCity) dbQuery = dbQuery.ilike('origin_city', `%${originCity}%`);
  if (originState) dbQuery = dbQuery.eq('origin_state', originState);
  if (destCity) dbQuery = dbQuery.ilike('destination_city', `%${destCity}%`);
  if (destState) dbQuery = dbQuery.eq('destination_state', destState);
  if (equipmentType) dbQuery = dbQuery.eq('equipment_type', equipmentType);
  if (rateType) dbQuery = dbQuery.eq('rate_type', rateType);
  if (minAmount !== undefined) dbQuery = dbQuery.gte('rate_amount', minAmount);
  if (maxAmount !== undefined) dbQuery = dbQuery.lte('rate_amount', maxAmount);
  if (companyId) dbQuery = dbQuery.eq('company_id', companyId);

  const { data, error } = await dbQuery;
  if (error) throw error;
  return data;
}

module.exports = {
  findRatesByLane,
  findRatesByCompany,
  getBestRate,
  createRate,
  searchRates,
};
