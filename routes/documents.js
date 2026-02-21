const express = require('express');
const router = express.Router();
const {
  createDocument,
  getDocument,
  updateStatus,
  getByStatus,
  getPending,
  setRawText,
  listDocuments,
  deleteDocument,
} = require('../lib/queries/documents');

// POST / - Create a new document
router.post('/', async (req, res) => {
  try {
    const { filename, documentType, fileUrl, fileType, metadata } = req.body;

    if (!filename || !documentType) {
      return res.status(400).json({ error: 'filename and documentType are required' });
    }

    const docData = {
      filename,
      document_type: documentType,
      file_url: fileUrl,
      file_type: fileType,
      metadata,
    };

    const doc = await createDocument(docData);
    return res.status(201).json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET / - List documents
router.get('/', async (req, res) => {
  try {
    const { documentType, status, limit, offset } = req.query;

    const docs = await listDocuments({ documentType, status, limit, offset });
    return res.status(200).json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /pending - Get pending documents (extraction queue)
router.get('/pending', async (req, res) => {
  try {
    const docs = await getPending();
    return res.status(200).json(docs);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /:id - Get single document by ID
router.get('/:id', async (req, res) => {
  try {
    const doc = await getDocument(req.params.id);

    if (!doc) {
      return res.status(404).json({ error: 'Document not found' });
    }

    return res.status(200).json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/status - Update document status
router.patch('/:id/status', async (req, res) => {
  try {
    const { status, errorMessage } = req.body;

    if (!status) {
      return res.status(400).json({ error: 'status is required' });
    }

    const doc = await updateStatus(req.params.id, status, errorMessage);
    return res.status(200).json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// PATCH /:id/text - Set raw text
router.patch('/:id/text', async (req, res) => {
  try {
    const { rawText } = req.body;

    if (rawText === undefined) {
      return res.status(400).json({ error: 'rawText is required' });
    }

    const doc = await setRawText(req.params.id, rawText);
    return res.status(200).json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const doc = await deleteDocument(req.params.id);
    return res.status(200).json(doc);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
