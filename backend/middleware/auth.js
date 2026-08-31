// =========================================================
// AUTH MIDDLEWARE - YANGILANGAN (tokenVersion tekshiruvi)
// =========================================================
const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token topilmadi. Iltimos, tizimga kiring.'
      });
    }

    // Tokenni decode qilish
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    
    // Adminni bazadan tekshirish
    const admin = await Admin.findById(decoded.id).select('username tokenVersion');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin topilmadi. Iltimos, qayta kiring.'
      });
    }

    // Token versiyasini tekshirish (agar o'zgargan bo'lsa, token yaroqsiz)
    if (decoded.tokenVersion !== admin.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Sizning ma\'lumotlaringiz boshqa qurilmada o\'zgartirilgan. Iltimos, qayta kiring.',
        forceLogout: true
      });
    }

    req.admin = {
      id: admin._id,
      username: admin.username,
      tokenVersion: admin.tokenVersion
    };
    
    next();
  } catch (error) {
    console.error('Auth xatosi:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri token.'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token muddati tugagan. Iltimos, qayta kiring.'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
};

module.exports = auth;
