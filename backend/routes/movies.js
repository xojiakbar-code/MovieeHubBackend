// =========================================================
// MOVIES ROUTE'LAR - AQLLI QIDIRUV BILAN
// =========================================================
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
// GET - AQLLI QIDIRUV (Fuzzy Search)
// =========================================================
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || typeof q !== 'string' || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }

    const query = q.trim().toLowerCase();
    
    // 1. Avval aniq qidiruv
    let movies = await Movie.find({
      $or: [
        { nomi: { $regex: query, $options: 'i' } },
        { janr: { $regex: query, $options: 'i' } }
      ]
    }).sort({ createdAt: -1 }).lean();

    // 2. Agar natija bo'lmasa, fuzzy search (harflarni solishtirish)
    if (movies.length === 0 && query.length > 1) {
      const allMovies = await Movie.find().lean();
      
      // O'xshash harflar
      const similarChars = {
        'c': ['k', 's'],
        's': ['sh', 'z', 'c'],
        'z': ['s'],
        'k': ['c', 'q', 'g', 'x'],
        'q': ['k'],
        'g': ['k', 'j'],
        'j': ['g', 'i'],
        'o': ['a', 'u'],
        'a': ['o', 'e'],
        'e': ['i', 'a'],
        'i': ['e', 'y'],
        'y': ['i'],
        'u': ['o'],
        'h': ['x', 'g'],
        'x': ['h', 'k'],
        'b': ['p', 'v'],
        'p': ['b'],
        'v': ['b', 'w'],
        'w': ['v'],
        'd': ['t'],
        't': ['d'],
        'm': ['n'],
        'n': ['m'],
        'r': ['l'],
        'l': ['r']
      };
      
      const fuzzyResults = allMovies.filter(m => {
        const name = m.nomi.toLowerCase();
        let nameIndex = 0, queryIndex = 0, matches = 0;
        
        while (nameIndex < name.length && queryIndex < query.length) {
          const nameChar = name[nameIndex];
          const queryChar = query[queryIndex];
          
          if (nameChar === queryChar) {
            matches++;
            queryIndex++;
          } else if (similarChars[nameChar] && similarChars[nameChar].includes(queryChar)) {
            matches++;
            queryIndex++;
          } else if (similarChars[queryChar] && similarChars[queryChar].includes(nameChar)) {
            matches++;
            queryIndex++;
          } else {
            // 1 harf tashlab ketish
            if (queryIndex < query.length - 1 && nameChar === query[queryIndex + 1]) {
              matches++;
              queryIndex += 2;
            } else {
              nameIndex++;
              continue;
            }
          }
          nameIndex++;
        }
        
        const matchPercent = matches / Math.max(query.length, name.length);
        return matchPercent >= 0.5;
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
    console.error('Search xatosi:', error);
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
