// Asosiy server fayli
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcrypt');

// Modellarni import qilish
const Admin = require('./models/Admin');

// Route'larni import qilish
const movieRoutes = require('./routes/movies');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 5000;

// ============ MIDDLEWARE'LAR ============
app.use(cors({
  origin: '*', // Barcha domainlarga ruxsat berish
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Yuklangan fayllarni statik qilib ochish
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ============ ROUTE'LAR ============
app.use('/api/movies', movieRoutes);
app.use('/api/admin', adminRoutes);

// ============ ROOT VA BOSHQA SAHIFALAR ============
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🎬 MovieHub API ishlamoqda!',
    baseUrl: 'https://movieehubbackend.onrender.com',
    endpoints: {
      movies: 'https://movieehubbackend.onrender.com/api/movies',
      search: 'https://movieehubbackend.onrender.com/api/movies/search?q=nom',
      movieById: 'https://movieehubbackend.onrender.com/api/movies/:id',
      adminLogin: 'https://movieehubbackend.onrender.com/api/admin/login'
    },
    docs: 'https://github.com/xojiakbar-code/MovieeHubBackend'
  });
});

// 404 - Topilmadi
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'So\'ralgan manzil topilmadi. API endpointlarini tekshiring.'
  });
});

// Xatoliklarni ushlash
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err);
  res.status(500).json({
    success: false,
    message: 'Serverda xatolik yuz berdi: ' + err.message
  });
});

// ============ MONGODB ULASH ============
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi.');
  } catch (error) {
    console.error('❌ MongoDB ga ulanish xatosi:', error);
    process.exit(1);
  }
}

// ============ ADMIN YARATISH ============
async function createDefaultAdmin() {
  try {
    const adminCount = await Admin.countDocuments();
    
    if (adminCount === 0) {
      const defaultAdmin = {
        username: process.env.ADMIN_USERNAME || 'admin',
        password: process.env.ADMIN_PASSWORD || 'admin123'
      };
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultAdmin.password, salt);
      
      await Admin.create({
        username: defaultAdmin.username,
        password: hashedPassword
      });
      
      console.log('✅ Default admin yaratildi:');
      console.log(`   Username: ${defaultAdmin.username}`);
      console.log(`   Password: ${defaultAdmin.password}`);
      console.log('   ⚠️  Xavfsizlik uchun parolni o\'zgartirishni tavsiya qilamiz!');
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
    console.log(`🚀 Server https://movieehubbackend.onrender.com da ishga tushdi.`);
    console.log(`📚 API endpoint: https://movieehubbackend.onrender.com/api/movies`);
    console.log(`🔐 Admin login: https://movieehubbackend.onrender.com/api/admin/login`);
    console.log(`🏠 Bosh sahifa: https://movieehubbackend.onrender.com/`);
  });
}

startServer();

// Tutilmagan xatoliklarni ushlash
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
  process.exit(0);
});
