const { supabase } = require('../supabase');

async function getActiveContracts(options = {}) {
  const { contractType, companyId, limit = 50 } = options;

  let query = supabase
    .from('contracts')
    .select('*, companies(name, mc_number)')
    .eq('status', 'active')
    .limit(limit);

  if (contractType) {
    query = query.eq('contract_type', contractType);
  }

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getExpiringContracts(withinDays = 30) {
  const today = new Date();
  const cutoff = new Date(today);
  cutoff.setDate(today.getDate() + withinDays);

  const todayStr = today.toISOString().split('T')[0];
  const cutoffStr = cutoff.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('contracts')
    .select('*, companies(name, mc_number)')
    .eq('status', 'active')
    .gte('expiration_date', todayStr)
    .lte('expiration_date', cutoffStr)
    .order('expiration_date', { ascending: true });
  if (error) throw error;
  return data;
}

async function getByCompany(companyId, options = {}) {
  const { status, contractType } = options;

  let query = supabase
    .from('contracts')
    .select('*, documents(filename, document_type)')
    .eq('company_id', companyId);

  if (status) {
    query = query.eq('status', status);
  }

  if (contractType) {
    query = query.eq('contract_type', contractType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function getContract(id) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*, companies(name, mc_number, email), documents(filename, document_type), contract_contacts(*)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function createContract(contractData) {
  const { data, error } = await supabase
    .from('contracts')
    .insert(contractData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateContract(id, updates) {
  const { data, error } = await supabase
    .from('contracts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getContractWithRates(id) {
  const { data, error } = await supabase
    .from('contracts')
    .select('*, rates(*), companies(name)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

module.exports = {
  getActiveContracts,
  getExpiringContracts,
  getByCompany,
  getContract,
  createContract,
  updateContract,
  getContractWithRates,
};
