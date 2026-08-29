// =========================================================
// MOVIEHUB BACKEND - To'liq server (Tuzatilgan)
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
app.use(cors({
  origin: '*',
  credentials: true
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
  nomi: { type: String, required: true, trim: true },
  turi: { type: String, enum: ['film', 'serial'], required: true },
  janr: { type: String, required: true, trim: true },
  davlati: { type: String, required: true, trim: true },
  yili: { type: Number, required: true },
  tili: { type: String, required: true, trim: true },
  yoshChegarasi: { type: String, default: '0+' },
  davomiyligi: { type: String, required: true, trim: true },
  rasm: { type: String, required: true },
  video: { type: String, default: '' },
  qismlar: [{
    qismRaqami: { type: Number, required: true },
    video: { type: String, required: true }
  }]
}, { timestamps: true });

// Admin Schema
const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

// Admin parolni hash qilish
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
        message: 'Token topilmadi' 
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ 
      success: false, 
      message: 'Noto\'g\'ri token' 
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
    message: '🎬 MovieHub API',
    version: '1.0.0',
    endpoints: {
      movies: '/api/movies',
      search: '/api/movies/search?q=nom',
      movieById: '/api/movies/:id',
      adminLogin: '/api/admin/login'
    }
  });
});

// -------------------- HEALTH --------------------
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// -------------------- MOVIES --------------------
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }
    const movies = await Movie.find({
      nomi: { $regex: q.trim(), $options: 'i' }
    }).sort({ createdAt: -1 }).lean();
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const movie = await Movie.findById(req.params.id).lean();
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// -------------------- ADMIN LOGIN (TUZATILGAN) --------------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('🔑 Login so\'rovi:', { username });
    
    if (!username || !password) {
      console.log('❌ Username yoki parol yo\'q');
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi'
      });
    }
    
    // Adminni topish
    const admin = await Admin.findOne({ username });
    console.log('👤 Admin topildi:', admin ? 'Ha' : `Yo'q (username: ${username})`);
    
    if (!admin) {
      console.log('❌ Admin topilmadi');
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // Parolni tekshirish
    const isValid = await admin.comparePassword(password);
    console.log('🔐 Parol tekshiruvi:', isValid ? '✅ To\'g\'ri' : '❌ Noto\'g\'ri');
    
    if (!isValid) {
      console.log('❌ Parol noto\'g\'ri');
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // Token yaratish
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login muvaffaqiyatli! Token yaratildi');
    
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
    message: 'So\'ralgan manzil topilmadi'
  });
});

// -------------------- ERROR HANDLER --------------------
app.use((err, req, res, next) => {
  console.error('❌ Server xatosi:', err);
  res.status(500).json({
    success: false,
    message: 'Serverda xatolik: ' + err.message
  });
});

// =========================================================
// MONGODB ULASH VA SERVERNI ISHGA TUSHIRISH
// =========================================================
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/moviehub');
    console.log('✅ MongoDB ga ulandi.');
  } catch (error) {
    console.error('❌ MongoDB ulanish xatosi:', error);
    process.exit(1);
  }
}

async function createDefaultAdmin() {
  try {
    const count = await Admin.countDocuments();
    
    if (count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'kuchli_parol123';
      
      const admin = new Admin({ username, password });
      await admin.save();
      
      console.log('✅ Admin yaratildi:');
      console.log(`   👤 Username: ${username}`);
      console.log(`   🔑 Password: ${password}`);
    } else {
      console.log(`✅ ${count} ta admin mavjud`);
    }
  } catch (error) {
    console.error('Admin yaratish xatosi:', error);
  }
}

async function startServer() {
  await connectDB();
  await createDefaultAdmin();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda ishlamoqda`);
    console.log(`🌐 http://localhost:${PORT}`);
  });
}

startServer();

process.on('unhandledRejection', (error) => {
  console.error('❌ Tutilmagan xato:', error);
});
