// =========================================================
// MOVIES ROUTE'LAR - LIKE/DISLIKE QO'SHILGAN
// =========================================================
const express = require('express');
const Movie = require('../models/Movie');
const auth = require('../middleware/auth');
const router = express.Router();

// ... (boshqa route'lar)

// =========================================================
// LIKE / DISLIKE
// =========================================================

// POST - Like qo'shish yoki o'chirish
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
    
    // Foydalanuvchi allaqachon like bosganmi?
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

// POST - Dislike qo'shish yoki o'chirish
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

// GET - Film like/dislike holati
router.get('/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const movie = await Movie.findById(id).select('likes dislikes likedBy dislikedBy');
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const userKey = userId.toString();

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
    console.error('Rating xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
