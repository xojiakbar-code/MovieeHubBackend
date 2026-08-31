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

// GET - Qidiruv
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }
    const movies = await Movie.find({
      nomi: { $regex: q.trim(), $options: 'i' }
    }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Bitta film
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
// LIKE / DISLIKE - FILM UCHUN
// =========================================================

router.post('/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const userKey = userId.toString();
    const alreadyLiked = movie.likedBy.includes(userKey);
    const alreadyDisliked = movie.dislikedBy.includes(userKey);

    if (alreadyLiked) {
      // Like ni o'chirish
      movie.likes = Math.max(0, movie.likes - 1);
      movie.likedBy = movie.likedBy.filter(id => id !== userKey);
    } else {
      // Like qo'shish
      movie.likes += 1;
      movie.likedBy.push(userKey);
      
      // Agar dislike bosgan bo'lsa, uni o'chirish
      if (alreadyDisliked) {
        movie.dislikes = Math.max(0, movie.dislikes - 1);
        movie.dislikedBy = movie.dislikedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    res.json({
      success: true,
      data: {
        likes: movie.likes,
        dislikes: movie.dislikes,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey)
      }
    });
  } catch (error) {
    console.error('Like xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/dislike', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const userKey = userId.toString();
    const alreadyLiked = movie.likedBy.includes(userKey);
    const alreadyDisliked = movie.dislikedBy.includes(userKey);

    if (alreadyDisliked) {
      // Dislike ni o'chirish
      movie.dislikes = Math.max(0, movie.dislikes - 1);
      movie.dislikedBy = movie.dislikedBy.filter(id => id !== userKey);
    } else {
      // Dislike qo'shish
      movie.dislikes += 1;
      movie.dislikedBy.push(userKey);
      
      // Agar like bosgan bo'lsa, uni o'chirish
      if (alreadyLiked) {
        movie.likes = Math.max(0, movie.likes - 1);
        movie.likedBy = movie.likedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    res.json({
      success: true,
      data: {
        likes: movie.likes,
        dislikes: movie.dislikes,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey)
      }
    });
  } catch (error) {
    console.error('Dislike xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// LIKE / DISLIKE - QISM UCHUN
// =========================================================

router.post('/:id/qism/:qismIndex/like', async (req, res) => {
  try {
    const { id, qismIndex } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const index = parseInt(qismIndex);
    if (index < 0 || index >= movie.qismlar.length) {
      return res.status(400).json({ success: false, message: 'Qism topilmadi' });
    }

    const qism = movie.qismlar[index];
    const userKey = userId.toString();
    const alreadyLiked = qism.likedBy.includes(userKey);
    const alreadyDisliked = qism.dislikedBy.includes(userKey);

    if (alreadyLiked) {
      qism.likes = Math.max(0, qism.likes - 1);
      qism.likedBy = qism.likedBy.filter(id => id !== userKey);
    } else {
      qism.likes += 1;
      qism.likedBy.push(userKey);
      if (alreadyDisliked) {
        qism.dislikes = Math.max(0, qism.dislikes - 1);
        qism.dislikedBy = qism.dislikedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    res.json({
      success: true,
      data: {
        likes: qism.likes,
        dislikes: qism.dislikes,
        userLiked: qism.likedBy.includes(userKey),
        userDisliked: qism.dislikedBy.includes(userKey),
        qismIndex: index
      }
    });
  } catch (error) {
    console.error('Qism like xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/:id/qism/:qismIndex/dislike', async (req, res) => {
  try {
    const { id, qismIndex } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const index = parseInt(qismIndex);
    if (index < 0 || index >= movie.qismlar.length) {
      return res.status(400).json({ success: false, message: 'Qism topilmadi' });
    }

    const qism = movie.qismlar[index];
    const userKey = userId.toString();
    const alreadyLiked = qism.likedBy.includes(userKey);
    const alreadyDisliked = qism.dislikedBy.includes(userKey);

    if (alreadyDisliked) {
      qism.dislikes = Math.max(0, qism.dislikes - 1);
      qism.dislikedBy = qism.dislikedBy.filter(id => id !== userKey);
    } else {
      qism.dislikes += 1;
      qism.dislikedBy.push(userKey);
      if (alreadyLiked) {
        qism.likes = Math.max(0, qism.likes - 1);
        qism.likedBy = qism.likedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    res.json({
      success: true,
      data: {
        likes: qism.likes,
        dislikes: qism.dislikes,
        userLiked: qism.likedBy.includes(userKey),
        userDisliked: qism.dislikedBy.includes(userKey),
        qismIndex: index
      }
    });
  } catch (error) {
    console.error('Qism dislike xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Film rating
router.get('/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id).select('likes dislikes likedBy dislikedBy qismlar');
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const userKey = userId.toString();

    const qismRating = movie.qismlar.map((qism, index) => ({
      index,
      likes: qism.likes || 0,
      dislikes: qism.dislikes || 0,
      userLiked: qism.likedBy.includes(userKey),
      userDisliked: qism.dislikedBy.includes(userKey)
    }));

    res.json({
      success: true,
      data: {
        likes: movie.likes || 0,
        dislikes: movie.dislikes || 0,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey),
        qismlar: qismRating
      }
    });
  } catch (error) {
    console.error('Rating xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Film qo'shish (Admin)
router.post('/', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Film yangilash (Admin)
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

// DELETE - Film o'chirish (Admin)
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
