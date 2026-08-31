// =========================================================
// MOVIEHUB BACKEND - YANGILANGAN (TO'LIQ)
// =========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 5000;

// =========================================================
// SECURITY & PERFORMANCE MIDDLEWARE
// =========================================================
app.use(compression());
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 100,
  message: { success: false, message: '⚠️ Juda ko\'p so\'rov' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  maxAge: 86400
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '1d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg') || filePath.endsWith('.png')) {
      res.set('Cache-Control', 'public, max-age=86400');
    }
  }
}));

// =========================================================
// MONGODB CONNECTION
// =========================================================
const mongooseOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true
};

// =========================================================
// SCHEMALAR
// =========================================================
const MovieSchema = new mongoose.Schema({
  nomi: { type: String, required: true, trim: true, index: true },
  turi: { type: String, enum: ['film', 'serial'], required: true, index: true },
  janr: { type: String, required: true, trim: true, index: true },
  davlati: { type: String, required: true, trim: true },
  yili: { type: Number, required: true, index: true },
  tili: { type: String, required: true, trim: true },
  yoshChegarasi: { type: String, default: '0+', index: true },
  davomiyligi: { type: String, required: true, trim: true },
  rasm: { type: String, required: true },
  video: { type: String, default: '' },
  qismlar: [{
    qismRaqami: { type: Number, required: true },
    video: { type: String, required: true }
  }],
  views: { type: Number, default: 0 },
  rating: { type: Number, default: 0 }
}, { timestamps: true });

MovieSchema.index({ nomi: 'text' });
MovieSchema.index({ turi: 1, yili: -1 });
MovieSchema.index({ janr: 1, yili: -1 });

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

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

AdminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Movie = mongoose.model('Movie', MovieSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// =========================================================
// AUTH MIDDLEWARE (YANGILANGAN - tokenVersion bilan)
// =========================================================
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Token topilmadi. Iltimos, tizimga kiring.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    
    const admin = await Admin.findById(decoded.id).select('username tokenVersion');
    
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Admin topilmadi. Iltimos, qayta kiring.'
      });
    }

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

// =========================================================
// CACHE
// =========================================================
class Cache {
  constructor() {
    this.store = new Map();
    this.defaultTTL = 30000;
  }

  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() - item.timestamp > item.ttl) {
      this.store.delete(key);
      return null;
    }
    return item.data;
  }

  set(key, data, ttl = this.defaultTTL) {
    this.store.set(key, { data, timestamp: Date.now(), ttl });
  }

  clear() { this.store.clear(); }

  clean() {
    const now = Date.now();
    for (const [key, item] of this.store) {
      if (now - item.timestamp > item.ttl) {
        this.store.delete(key);
      }
    }
  }
}

const cache = new Cache();
setInterval(() => cache.clean(), 5 * 60 * 1000);

// =========================================================
// ROUTE'LAR
// =========================================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    cacheSize: cache.store.size
  });
});

app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: '🎬 MovieHub API', 
    version: '1.0.0'
  });
});

// =========================================================
// ADMIN ROUTE'LAR
// =========================================================

// Admin login
app.post('/api/admin/login', async (req, res) => {
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

// GET - Joriy admin ma'lumotlari (TO'G'RILANGAN)
app.get('/api/admin/me', auth, async (req, res) => {
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

// PUT - Admin ma'lumotlarini yangilash
app.put('/api/admin/update', auth, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const adminId = req.admin.id;
    
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({
        success: false,
        message: 'Admin topilmadi'
      });
    }

    if (username && username !== admin.username) {
      const existingAdmin = await Admin.findOne({ username });
      if (existingAdmin) {
        return res.status(400).json({
          success: false,
          message: 'Bu username allaqachon mavjud'
        });
      }
      admin.username = username;
    }

    if (newPassword) {
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
      
      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(newPassword, salt);
      admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    }

    await admin.save();

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

// =========================================================
// MOVIES ROUTE'LAR
// =========================================================

// GET - Barcha filmlar
app.get('/api/movies', async (req, res) => {
  try {
    const cacheKey = 'all_movies';
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, count: cached.length, data: cached, cached: true });
    }

    const movies = await Movie.find().sort({ createdAt: -1 }).select('-__v').lean().limit(50);
    cache.set(cacheKey, movies);
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// GET - Qidiruv
app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }

    const cacheKey = `search_${q.trim().toLowerCase()}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, count: cached.length, data: cached, cached: true });
    }

    const movies = await Movie.find({
      $or: [
        { nomi: { $regex: q.trim(), $options: 'i' } },
        { janr: { $regex: q.trim(), $options: 'i' } }
      ]
    }).sort({ createdAt: -1 }).select('-__v').lean().limit(50);

    cache.set(cacheKey, movies, 15000);
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// GET - Bitta film
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ success: false, message: 'Noto\'g\'ri ID' });
    }

    const cacheKey = `movie_${id}`;
    const cached = cache.get(cacheKey);
    if (cached) {
      return res.json({ success: true, data: cached, cached: true });
    }

    const movie = await Movie.findById(id).select('-__v').lean();
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    Movie.findByIdAndUpdate(id, { $inc: { views: 1 } }).catch(() => {});
    cache.set(cacheKey, movie, 60000);
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// POST - Film qo'shish (Admin)
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    cache.clear();
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Film yangilash (Admin)
app.put('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'Film topilmadi' });
    cache.clear();
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Film o'chirish (Admin)
app.delete('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'Film topilmadi' });
    cache.clear();
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Manzil topilmadi' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ success: false, message: 'Server xatosi' });
});

// =========================================================
// MONGODB ULASH
// =========================================================
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/moviehub', mongooseOptions);
    console.log('✅ MongoDB ulandi.');
  } catch (error) {
    console.error('❌ MongoDB xatosi:', error);
    process.exit(1);
  }
}

async function initAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'kuchli_parol123';
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      await Admin.create({ 
        username, 
        password: hashedPassword,
        tokenVersion: 0
      });
      console.log(`✅ Admin yaratildi: ${username} / ${password}`);
    }
  } catch (error) {
    console.error('Admin init xatosi:', error);
  }
}

async function startServer() {
  await connectDB();
  await initAdmin();
  
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda`);
    console.log(`💾 Kesh hajmi: ${cache.store.size}`);
    console.log(`🔑 Login: admin / kuchli_parol123`);
  });
}

startServer();

process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('👋 Server to\'xtatilmoqda (SIGTERM)...');
  mongoose.connection.close().then(() => process.exit(0));
});
