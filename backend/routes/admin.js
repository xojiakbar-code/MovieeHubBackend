// =========================================================
// ADMIN ROUTE'LAR - YANGILANGAN
// =========================================================
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Admin = require('../models/Admin');
const auth = require('../middleware/auth');
const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi'
      });
    }

    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }

    // Token yaratish (tokenVersion qo'shildi)
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username,
        tokenVersion: admin.tokenVersion || 0
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    res.json({
      success: true,
      token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Login xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi'
    });
  }
});

// =========================================================
// ADMIN MA'LUMOTLARINI YANGILASH
// =========================================================

// GET - Joriy admin ma'lumotlari
router.get('/me', auth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin topilmadi'
      });
    }
    res.json({
      success: true,
      data: admin
    });
  } catch (error) {
    console.error('Admin ma\'lumotlarini olish xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi'
    });
  }
});

// PUT - Admin ma'lumotlarini yangilash (username va parol)
router.put('/update', auth, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;
    
    // Adminni topish
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin topilmadi'
      });
    }

    // Agar username o'zgartirilsa
    if (username && username !== admin.username) {
      // Username unikal ekanligini tekshirish
      const existingAdmin = await Admin.findOne({ username });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Bu username allaqachon mavjud'
        });
      }
      admin.username = username;
    }

    // Agar parol o'zgartirilsa
    if (newPassword) {
      // Joriy parolni tekshirish
      if (!currentPassword) {
        return res.status(400).json({
          success: false,
          message: 'Parolni o\'zgartirish uchun joriy parolni kiriting'
        });
      }
      
      const isValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isValid) {
        return res.status(401).json({
          success: false,
          message: 'Joriy parol noto\'g\'ri'
        });
      }
      
      // Yangi parolni hash qilish
      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(newPassword, salt);
      
      // Token versiyasini oshirish (barcha eski tokenlarni yaroqsiz qilish)
      admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    }

    await admin.save();

    // Yangi token yaratish (yangi ma'lumotlar bilan)
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username,
        tokenVersion: admin.tokenVersion
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({
      success: true,
      message: 'Ma\'lumotlar muvaffaqiyatli yangilandi',
      token: token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
  } catch (error) {
    console.error('Admin yangilash xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

module.exports = router;
