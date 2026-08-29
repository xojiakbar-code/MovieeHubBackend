// Asosiy server fayli
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

// Modellarni import qilish
const Admin = require('./models/Admin');
const Movie = require('./models/Movie');

// Route'larni import qilish
const movieRoutes = require('./routes/movies');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============ MIDDLEWARE'LAR ============

// CORS sozlamalari - Frontend Cloudflare Pages uchun
const allowedOrigins = [
  'https://movihub.pages.dev',
  'https://moviehub.pages.dev',
  'https://*.pages.dev',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    // Agar origin bo'lmasa (masalan, Postman yoki mobil ilova), ruxsat berish
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.some(allowed => origin.match(allowed.replace(/\*/g, '.*')))) {
      callback(null, true);
    } else {
      console.log('CORS bloklangan origin:', origin);
      callback(null, true); // Ishlab chiqarishda false qilib qo'yish mumkin
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Yuklangan fayllarni statik qilib ochish
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// ============ ROUTE'LAR ============
app.use('/api/movies', movieRoutes);
app.use('/api/admin', adminRoutes);

// ============ ROOT VA BOSHQA SAHIFALAR ============
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🎬 MovieHub API ishlamoqda!',
    version: '1.0.0',
    baseUrl: process.env.BASE_URL || 'https://movieehubbackend.onrender.com',
    endpoints: {
      movies: '/api/movies',
      search: '/api/movies/search?q=nom',
      movieById: '/api/movies/:id',
      adminLogin: '/api/admin/login',
      uploads: '/uploads/'
    },
    docs: 'https://github.com/xojiakbar-code/MovieeHubBackend',
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Health check - Render uchun
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// 404 - Topilmadi
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'So\'ralgan manzil topilmadi. API endpointlarini tekshiring.',
    availableEndpoints: [
      '/',
      '/health',
      '/api/movies',
      '/api/movies/search?q=nom',
      '/api/movies/:id',
      '/api/admin/login',
      '/uploads/'
    ]
  });
});

// ============ XATOLIKLARNI USHLASH ============
app.use((err, req, res, next) => {
  console.error('❌ Server xatosi:', err);
  
  // Multer xatoliklari
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({
      success: false,
      message: 'Fayl hajmi juda katta. Maksimal 50MB ruxsat etiladi.'
    });
  }
  
  res.status(500).json({
    success: false,
    message: 'Serverda xatolik yuz berdi: ' + err.message
  });
});

// ============ MONGODB ULASH ============
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi.');
  } catch (error) {
    console.error('❌ MongoDB ga ulanish xatosi:', error);
    process.exit(1);
  }
}

// ============ ADMIN YARATISH (birinchi ishga tushganda) ============
async function createDefaultAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    
    if (adminCount === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'admin123';
      
      // Parolni hash qilish
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      await Admin.create({
        username: username,
        password: hashedPassword
      });
      
      console.log('✅ Default admin yaratildi:');
      console.log(`   Username: ${username}`);
      console.log(`   Password: ${password}`);
      console.log('   ⚠️  Xavfsizlik uchun parolni o\'zgartirishni tavsiya qilamiz!');
    } else {
      console.log(`✅ Admin mavjud (${adminCount} ta admin)`);
    }
  } catch (error) {
    console.error('Admin yaratish xatosi:', error);
  }
}

// ============ SERVERNI ISHGA TUSHIRISH ============
async function startServer() {
  await connectDB();
  await createDefaultAdmin();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda ishga tushdi.`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api/movies`);
    console.log(`🔐 Admin: http://localhost:${PORT}/api/admin/login`);
    console.log(`🏠 Root: http://localhost:${PORT}/`);
    
    if (process.env.BASE_URL) {
      console.log(`🌍 Production: ${process.env.BASE_URL}`);
    }
  });
}

startServer();

// ============ TUTILMAGAN XATOLIKLARNI USHLASH ============
process.on('unhandledRejection', (error) => {
  console.error('❌ Tutilmagan xato:', error);
  if (process.env.NODE_ENV === 'production') {
    console.log('⚠️  Xatolik yuz berdi, lekin server ishlashda davom etmoqda.');
  } else {
    process.exit(1);
  }
});

process.on('SIGINT', () => {
  console.log('\n👋 Server to\'xtatilmoqda...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB ulanishi yopildi.');
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  console.log('\n👋 Server to\'xtatilmoqda (SIGTERM)...');
  mongoose.connection.close(() => {
    console.log('✅ MongoDB ulanishi yopildi.');
    process.exit(0);
  });
});
