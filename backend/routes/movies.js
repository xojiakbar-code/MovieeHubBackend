const express = require('express');
const mongoose = require('mongoose');
const Movie = require('../models/Movie');
const auth = require('../middleware/auth');
const router = express.Router();

// =========================================================
// GET - Barcha filmlar
// =========================================================
router.get('/', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// GET - Qidiruv (Aqlli qidiruv)
// =========================================================
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }
    
    const query = q.trim();
    
    // 1. To'liq matn bo'yicha qidiruv
    const movies = await Movie.find({
      $or: [
        { nomi: { $regex: query, $options: 'i' } },
        { janr: { $regex: query, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 }).lean();
    
    // 2. Agar natija bo'lmasa, harflar bo'yicha moslik (fuzzy)
    if (movies.length === 0 && query.length > 2) {
      const allMovies = await Movie.find().lean();
      const fuzzyResults = allMovies.filter(m => {
        const name = m.nomi.toLowerCase();
        const q = query.toLowerCase();
        let nameIndex = 0;
        let queryIndex = 0;
        let matches = 0;
        
        while (nameIndex < name.length && queryIndex < q.length) {
          if (name[nameIndex] === q[queryIndex]) {
            matches++;
            queryIndex++;
          }
          nameIndex++;
        }
        
        return matches / q.length >= 0.6;
      });
      
      return res.json({ 
        success: true, 
        count: fuzzyResults.length, 
        data: fuzzyResults,
        fuzzy: true
      });
    }
    
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// GET - Bitta film
// =========================================================
router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id).lean();
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// POST - Film qo'shish (Admin)
// =========================================================
router.post('/', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// PUT - Film yangilash (Admin)
// =========================================================
router.put('/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// DELETE - Film o'chirish (Admin)
// =========================================================
router.delete('/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
