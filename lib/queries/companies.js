const { supabase } = require('../supabase');

async function findByMC(mcNumber) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('mc_number', mcNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findByDOT(dotNumber) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('dot_number', dotNumber)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function findByName(name) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .ilike('name', `%${name}%`);
  if (error) throw error;
  return data;
}

async function getCompanyWithContracts(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('*, contracts(*)')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getCompanyWithContacts(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('*, contract_contacts(*)')
    .eq('id', companyId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function listCompanies(options = {}) {
  const { companyType, state, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('companies')
    .select('*')
    .range(offset, offset + limit - 1);

  if (companyType) {
    query = query.eq('company_type', companyType);
  }

  if (state) {
    query = query.eq('state', state);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

async function createCompany(companyData) {
  const { data, error } = await supabase
    .from('companies')
    .insert(companyData)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateCompany(id, updates) {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

module.exports = {
  findByMC,
  findByDOT,
  findByName,
  getCompanyWithContracts,
  getCompanyWithContacts,
  listCompanies,
  createCompany,
  updateCompany,
};
