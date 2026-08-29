// =========================================================
// MOVIEHUB BACKEND - TO'LIQ SERVER
// =========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const app = express();
const PORT = process.env.PORT || 5000;

// =========================================================
// MIDDLEWARE
// =========================================================
// CORS - to'liq ochiq
app.use(cors({ 
  origin: '*', 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Uploads papkasi
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// =========================================================
// MONGODB SCHEMALAR
// =========================================================

// Movie Schema
const MovieSchema = new mongoose.Schema({
  nomi: { 
    type: String, 
    required: true, 
    trim: true 
  },
  turi: { 
    type: String, 
    enum: ['film', 'serial'], 
    required: true 
  },
  janr: { 
    type: String, 
    required: true, 
    trim: true 
  },
  davlati: { 
    type: String, 
    required: true, 
    trim: true 
  },
  yili: { 
    type: Number, 
    required: true 
  },
  tili: { 
    type: String, 
    required: true, 
    trim: true 
  },
  yoshChegarasi: { 
    type: String, 
    default: '0+' 
  },
  davomiyligi: { 
    type: String, 
    required: true, 
    trim: true 
  },
  rasm: { 
    type: String, 
    required: true 
  },
  video: { 
    type: String, 
    default: '' 
  },
  qismlar: [{
    qismRaqami: { 
      type: Number, 
      required: true 
    },
    video: { 
      type: String, 
      required: true 
    }
  }]
}, { 
  timestamps: true 
});

// Admin Schema
const AdminSchema = new mongoose.Schema({
  username: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  password: { 
    type: String, 
    required: true 
  }
}, { 
  timestamps: true 
});

// Admin parolni hash qilish (saqlashdan oldin)
AdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Admin parolni tekshirish
AdminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Parol tekshirish xatosi:', error);
    return false;
  }
};

const Movie = mongoose.model('Movie', MovieSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// =========================================================
// AUTH MIDDLEWARE
// =========================================================
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false, 
        message: 'Token topilmadi. Iltimos, tizimga kiring.' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    req.admin = decoded;
    next();
  } catch (error) {
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

// =========================================================
// ROUTE'LAR
// =========================================================

// -------------------- ROOT --------------------
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: '🎬 MovieHub API ishlamoqda!',
    version: '1.0.0',
    endpoints: {
      movies: '/api/movies',
      search: '/api/movies/search?q=nom',
      movieById: '/api/movies/:id',
      adminLogin: '/api/admin/login',
      uploads: '/uploads/'
    },
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// -------------------- HEALTH --------------------
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// -------------------- UPLOADS --------------------
app.get('/uploads/:filename', (req, res) => {
  try {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      res.status(404).json({ 
        success: false, 
        message: 'Fayl topilmadi' 
      });
    }
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// -------------------- MOVIES --------------------

// GET - Barcha filmlar
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await Movie.find()
      .sort({ createdAt: -1 })
      .lean();
    
    res.json({ 
      success: true, 
      count: movies.length, 
      data: movies 
    });
  } catch (error) {
    console.error('Filmlarni olish xatosi:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// GET - Qidiruv
app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({ 
        success: true, 
        data: [] 
      });
    }
    
    const movies = await Movie.find({
      nomi: { $regex: q.trim(), $options: 'i' }
    })
    .sort({ createdAt: -1 })
    .lean();
    
    res.json({ 
      success: true, 
      count: movies.length, 
      data: movies 
    });
  } catch (error) {
    console.error('Qidiruv xatosi:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// GET - Bitta film
app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id).lean();
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        message: 'Film topilmadi' 
      });
    }
    
    res.json({ 
      success: true, 
      data: movie 
    });
  } catch (error) {
    console.error('Filmni olish xatosi:', error);
    if (error.name === 'CastError') {
      return res.status(400).json({ 
        success: false, 
        message: 'Noto\'g\'ri ID formati' 
      });
    }
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// POST - Film qo'shish (Admin)
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    
    res.status(201).json({ 
      success: true, 
      message: 'Film muvaffaqiyatli qo\'shildi',
      data: movie 
    });
  } catch (error) {
    console.error('Film qo\'shish xatosi:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// PUT - Film yangilash (Admin)
app.put('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      req.body,
      { 
        new: true, 
        runValidators: true 
      }
    );
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        message: 'Film topilmadi' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Film muvaffaqiyatli yangilandi',
      data: movie 
    });
  } catch (error) {
    console.error('Film yangilash xatosi:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// DELETE - Film o'chirish (Admin)
app.delete('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        message: 'Film topilmadi' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Film o\'chirildi' 
    });
  } catch (error) {
    console.error('Film o\'chirish xatosi:', error);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// -------------------- ADMIN LOGIN --------------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔑 Login so\'rovi:', { username });
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi'
      });
    }
    
    // Adminni topish
    const admin = await Admin.findOne({ username });
    console.log('👤 Admin topildi:', admin ? 'Ha' : 'Yo\'q');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // Parolni tekshirish
    const isValid = await admin.comparePassword(password);
    console.log('🔐 Parol to\'g\'ri:', isValid ? 'Ha' : 'Yo\'q');
    
    if (!isValid) {
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // Token yaratish
    const token = jwt.sign(
      { 
        id: admin._id, 
        username: admin.username 
      },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login muvaffaqiyatli!');
    
    res.json({
      success: true,
      message: 'Tizimga muvaffaqiyatli kirdingiz',
      token: token,
      admin: {
        id: admin._id,
        username: admin.username
      }
    });
    
  } catch (error) {
    console.error('❌ Login xatosi:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi: ' + error.message
    });
  }
});

// -------------------- 404 --------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'So\'ralgan manzil topilmadi',
    availableEndpoints: [
      '/',
      '/health',
      '/api/movies',
      '/api/movies/search?q=nom',
      '/api/movies/:id',
      '/api/admin/login'
    ]
  });
});

// -------------------- ERROR HANDLER --------------------
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

// =========================================================
// MONGODB ULASH VA SERVERNI ISHGA TUSHIRISH
// =========================================================

async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/moviehub', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB ga muvaffaqiyatli ulandi.');
  } catch (error) {
    console.error('❌ MongoDB ga ulanish xatosi:', error);
    process.exit(1);
  }
}

// Admin parolni qayta o'rnatish (agar xato bo'lsa)
async function resetAdminPassword() {
  try {
    const username = process.env.ADMIN_USERNAME || 'admin';
    const newPassword = process.env.ADMIN_PASSWORD || 'kuchli_parol123';
    
    console.log(`🔄 Admin parolni tekshirish: ${username}`);
    
    const admin = await Admin.findOne({ username });
    
    if (admin) {
      // Parolni qayta hash qilish
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      admin.password = hashedPassword;
      await admin.save();
      
      console.log(`✅ Admin parol yangilandi!`);
      console.log(`   👤 Username: ${username}`);
      console.log(`   🔑 Password: ${newPassword}`);
      return true;
    } else {
      // Admin mavjud emas, yangi yaratish
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newPassword, salt);
      
      await Admin.create({
        username: username,
        password: hashedPassword
      });
      
      console.log(`✅ Admin yaratildi!`);
      console.log(`   👤 Username: ${username}`);
      console.log(`   🔑 Password: ${newPassword}`);
      return true;
    }
  } catch (error) {
    console.error('❌ Admin parolni yangilash xatosi:', error);
    return false;
  }
}

async function startServer() {
  await connectDB();
  await resetAdminPassword();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda ishga tushdi.`);
    console.log(`🌐 Local: http://localhost:${PORT}`);
    console.log(`📚 API: http://localhost:${PORT}/api/movies`);
    console.log(`🔐 Admin: http://localhost:${PORT}/api/admin/login`);
    console.log(`🏠 Root: http://localhost:${PORT}/`);
  });
}

startServer();

// =========================================================
// XATOLIKLARNI USHLASH
// =========================================================
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

module.exports = app;
