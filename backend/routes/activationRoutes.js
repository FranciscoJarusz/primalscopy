const express = require('express');
const activations = require('../lib/activationStore');

const router = express.Router();

router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json({ activations: activations.publico() });
});

router.get('/images/:file', (req, res) => {
    const file = activations.imagePath(req.params.file);
    if (!file) return res.status(404).end();
    res.set('Cache-Control', 'public, max-age=31536000, immutable');
    res.sendFile(file, error => {
        if (error && !res.headersSent) res.status(404).end();
    });
});

module.exports = router;
