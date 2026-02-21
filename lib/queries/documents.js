const { supabase } = require('../supabase');

/**
 * Insert a new document record.
 * @param {object} docData - Must include at least `filename` and `document_type`.
 * @returns {Promise<object>}
 */
async function createDocument(docData) {
  const { data, error } = await supabase
    .from('documents')
    .insert(docData)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get a single document by ID.
 * @param {string} id - UUID of the document.
 * @returns {Promise<object|null>}
 */
async function getDocument(id) {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * Update a document's status. If status is 'failed', also sets extraction_error.
 * @param {string} id - UUID of the document.
 * @param {string} status - One of 'pending', 'processing', 'extracted', 'failed'.
 * @param {string|null} [errorMessage=null] - Error message to store when status is 'failed'.
 * @returns {Promise<object>}
 */
async function updateStatus(id, status, errorMessage = null) {
  const updates = { status, updated_at: new Date().toISOString() };

  if (status === 'failed') {
    updates.extraction_error = errorMessage;
  }

  const { data, error } = await supabase
    .from('documents')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * Get documents by status, with optional filters.
 * @param {string} status - Status to filter by.
 * @param {object} options
 * @param {string} [options.documentType] - Filter by document_type.
 * @param {number} [options.limit=20] - Max number of results.
 * @returns {Promise<object[]>}
 */
async function getByStatus(status, options = {}) {
  const { documentType, limit = 20 } = options;

  let query = supabase
    .from('documents')
    .select('*')
    .eq('status', status)
    .order('uploaded_at', { ascending: false })
    .limit(limit);

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Get all pending documents, oldest first.
 * @returns {Promise<object[]>}
 */
async function getPending() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('status', 'pending')
    .order('uploaded_at', { ascending: true });

  if (error) throw error;
  return data;
}

/**
 * Update the raw_text field for a document.
 * @param {string} id - UUID of the document.
 * @param {string} rawText - Extracted raw text content.
 * @returns {Promise<object>}
 */
async function setRawText(id, rawText) {
  const { data, error } = await supabase
    .from('documents')
    .update({ raw_text: rawText, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

/**
 * List documents with optional filters, paginated.
 * @param {object} options
 * @param {string} [options.documentType] - Filter by document_type.
 * @param {string} [options.status] - Filter by status.
 * @param {number} [options.limit=50] - Max number of results.
 * @param {number} [options.offset=0] - Number of results to skip.
 * @returns {Promise<object[]>}
 */
async function listDocuments(options = {}) {
  const { documentType, status, limit = 50, offset = 0 } = options;

  let query = supabase
    .from('documents')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (documentType) {
    query = query.eq('document_type', documentType);
  }

  if (status) {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/**
 * Delete a document by ID.
 * @param {string} id - UUID of the document.
 * @returns {Promise<object>}
 */
async function deleteDocument(id) {
  const { data, error } = await supabase
    .from('documents')
    .delete()
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

module.exports = {
  createDocument,
  getDocument,
  updateStatus,
  getByStatus,
  getPending,
  setRawText,
  listDocuments,
  deleteDocument,
};
