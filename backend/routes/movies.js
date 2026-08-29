// Filmlar uchun API route'lar
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Movie = require('../models/Movie');
const auth = require('../middleware/auth');
const router = express.Router();

// Multer konfiguratsiyasi - fayllarni yuklash
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'backend/uploads/';
    // Papka mavjud emas bo'lsa, yaratish
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // Fayl nomini unikal qilish
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  }
});

// ============ HAMMAGA OCHIQ ROUTE'LAR ============

// Barcha filmlarni olish
router.get('/', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 });
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (error) {
    console.error('Filmlarni olish xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// Qidiruv - film nomi bo'yicha
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Qidiruv so\'zi kiritilmagan.'
      });
    }
    
    // Regex orqali case-insensitive qidiruv
    const movies = await Movie.find({
      nomi: { $regex: q, $options: 'i' }
    }).sort({ createdAt: -1 });
    
    res.status(200).json({
      success: true,
      count: movies.length,
      data: movies
    });
  } catch (error) {
    console.error('Qidiruv xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// Bitta filmni olish (ID bo'yicha)
router.get('/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Film topilmadi.'
      });
    }
    
    res.status(200).json({
      success: true,
      data: movie
    });
  } catch (error) {
    console.error('Filmni olish xatosi:', error);
    
    if (error.name === 'CastError') {
      return res.status(400).json({
        success: false,
        message: 'Noto\'g\'ri ID formati.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// ============ ADMIN ROUTE'LAR (auth bilan himoyalangan) ============

// Yangi film qo'shish
router.post('/', auth, upload.fields([
  { name: 'rasm', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'qismlarVideo', maxCount: 10 }
]), async (req, res) => {
  try {
    const movieData = JSON.parse(req.body.data);
    
    // Rasm va video fayllarini qayta ishlash
    if (req.files['rasm']) {
      movieData.rasm = '/uploads/' + req.files['rasm'][0].filename;
    }
    
    // Agar film bo'lsa
    if (movieData.turi === 'film' && req.files['video']) {
      movieData.video = '/uploads/' + req.files['video'][0].filename;
    }
    
    // Agar serial bo'lsa va qismlar mavjud bo'lsa
    if (movieData.turi === 'serial' && req.files['qismlarVideo']) {
      // Qismlar video fayllarini qayta ishlash
      const qismlarVideo = req.files['qismlarVideo'];
      const qismlar = JSON.parse(req.body.qismlar || '[]');
      
      movieData.qismlar = qismlar.map((qism, index) => ({
        qismRaqami: qism.qismRaqami || index + 1,
        video: '/uploads/' + qismlarVideo[index].filename
      }));
    }
    
    const movie = await Movie.create(movieData);
    
    res.status(201).json({
      success: true,
      message: 'Film muvaffaqiyatli qo\'shildi.',
      data: movie
    });
  } catch (error) {
    console.error('Film qo\'shish xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// Filmni tahrirlash
router.put('/:id', auth, upload.fields([
  { name: 'rasm', maxCount: 1 },
  { name: 'video', maxCount: 1 },
  { name: 'qismlarVideo', maxCount: 10 }
]), async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Film topilmadi.'
      });
    }
    
    const updateData = JSON.parse(req.body.data);
    
    // Rasm yangilangan bo'lsa
    if (req.files['rasm']) {
      updateData.rasm = '/uploads/' + req.files['rasm'][0].filename;
    }
    
    // Video yangilangan bo'lsa (film uchun)
    if (updateData.turi === 'film' && req.files['video']) {
      updateData.video = '/uploads/' + req.files['video'][0].filename;
    }
    
    // Qismlar yangilangan bo'lsa (serial uchun)
    if (updateData.turi === 'serial' && req.files['qismlarVideo']) {
      const qismlarVideo = req.files['qismlarVideo'];
      const qismlar = JSON.parse(req.body.qismlar || '[]');
      
      updateData.qismlar = qismlar.map((qism, index) => ({
        qismRaqami: qism.qismRaqami || index + 1,
        video: '/uploads/' + qismlarVideo[index].filename
      }));
    }
    
    const updatedMovie = await Movie.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Film muvaffaqiyatli yangilandi.',
      data: updatedMovie
    });
  } catch (error) {
    console.error('Filmni yangilash xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// Filmni o'chirish
router.delete('/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id);
    
    if (!movie) {
      return res.status(404).json({
        success: false,
        message: 'Film topilmadi.'
      });
    }
    
    // Fayllarni o'chirish (ixtiyoriy)
    // ...
    
    await movie.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Film muvaffaqiyatli o\'chirildi.'
    });
  } catch (error) {
    console.error('Filmni o\'chirish xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

module.exports = router;
