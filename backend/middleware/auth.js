// JWT token authentication middleware
const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    // Authorization header dan tokenni olish
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({
        success: false,
        message: 'Token topilmadi. Iltimos, tizimga kiring.'
      });
    }

    // "Bearer <token>" formatidan tokenni ajratib olish
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token noto\'g\'ri formatda.'
      });
    }

    // Tokenni tekshirish
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Foydalanuvchi ma'lumotlarini request ob'ektiga qo'shish
    req.admin = decoded;
    
    next();
  } catch (error) {
    console.error('Auth middleware xatosi:', error);
    
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
