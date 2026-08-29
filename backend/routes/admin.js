// Admin login route
const express = require('express');
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');
const router = express.Router();

// Admin login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Ma'lumotlarni tekshirish
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi.'
      });
    }
    
    // Bazadan adminni topish
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri username yoki parol.'
      });
    }
    
    // Parolni tekshirish
    const isPasswordValid = await admin.comparePassword(password);
    
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri username yoki parol.'
      });
    }
    
    // JWT token yaratish (7 kun amal qiladi)
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username 
      },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.status(200).json({
      success: true,
      message: 'Tizimga muvaffaqiyatli kirdingiz.',
      token: token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
    
  } catch (error) {
    console.error('Login xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

module.exports = router;
