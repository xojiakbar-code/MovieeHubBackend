// =========================================================
// PERFORMANCE MIDDLEWARE
// =========================================================

const compression = require('compression');

// 1. Compression - Javoblarni siqish
const compress = compression({
  level: 9, // Maksimal siqish
  threshold: 1024, // 1KB dan katta fayllarni siqish
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  }
});

// 2. Response Time - So'rov vaqtini o'lchash
const responseTime = (req, res, next) => {
  const start = Date.now();
  
  // Javob yuborilganda vaqtni hisoblash
  res.on('finish', () => {
    const duration = Date.now() - start;
    res.set('X-Response-Time', `${duration}ms`);
    
    // Sekin so'rovlarni log qilish
    if (duration > 1000) {
      console.warn(`⚠️ Sekin so'rov: ${req.method} ${req.url} - ${duration}ms`);
    }
  });
  
  next();
};

// 3. Cache Headers - Statik fayllar uchun
const cacheHeaders = (req, res, next) => {
  // Faqat statik fayllar uchun
  if (req.url.match(/\.(jpg|jpeg|png|gif|ico|css|js|svg|webp)$/i)) {
    res.set('Cache-Control', 'public, max-age=604800, immutable');
  }
  next();
};

// 4. Rate Limiting - So'rov cheklash
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 daqiqa
  max: 100, // Har bir IP dan 100 ta so'rov
  message: { 
    success: false, 
    message: '⚠️ Juda ko\'p so\'rov. Iltimos, 15 daqiqa kutib keyin urinib ko\'ring.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.ip === '127.0.0.1' // Localhostda cheklamaymiz
});

// 5. Request ID - Har bir so'rovga unikal ID
const requestId = (req, res, next) => {
  req.id = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
  res.set('X-Request-ID', req.id);
  next();
};

module.exports = {
  compress,
  responseTime,
  cacheHeaders,
  limiter,
  requestId
};
