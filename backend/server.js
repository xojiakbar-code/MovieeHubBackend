// =========================================================
// MOVIEHUB BACKEND - HIGH PERFORMANCE
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

// Compression - Javoblarni siqish
app.use(compression());

// Helmet - Xavfsizlik headerlari
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));

// Rate Limiting - Har bir IP dan keladigan so'rovlarni cheklash
const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 daqiqa
  max: 100, // Har bir IP dan 100 ta so'rov
  message: { 
    success: false, 
    message: '⚠️ Juda ko\'p so\'rov yuborildi. Iltimos, 1 daqiqa kutib keyin urinib ko\'ring.' 
  },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// CORS - Optimallashtirilgan
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  maxAge: 86400 // 24 soat
}));

// JSON parser - Limit bilan
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static files - Kesh bilan
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
// MONGODB CONNECTION - Optimallashtirilgan
// =========================================================
const mongooseOptions = {
  maxPoolSize: 10, // Maksimal ulanishlar soni
  minPoolSize: 2,
  socketTimeoutMS: 45000,
  connectTimeoutMS: 10000,
  serverSelectionTimeoutMS: 5000,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  retryReads: true
};

// =========================================================
// MONGODB SCHEMALAR - Indexlar bilan
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
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// COMPOUND INDEXLAR - Tez qidiruv uchun
MovieSchema.index({ nomi: 'text' });
MovieSchema.index({ turi: 1, yili: -1 });
MovieSchema.index({ janr: 1, yili: -1 });

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true }
}, { timestamps: true });

AdminSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

const Movie = mongoose.model('Movie', MovieSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// =========================================================
// AUTH MIDDLEWARE - Optimallashtirilgan
// =========================================================
const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token topilmadi' });
    }
    req.admin = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Noto\'g\'ri token' });
  }
};

// =========================================================
// CACHE SYSTEM - In-memory kesh
// =========================================================
class Cache {
  constructor() {
    this.store = new Map();
    this.defaultTTL = 30000; // 30 soniya
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

  clear() {
    this.store.clear();
  }

  // Eski keshni tozalash (har 5 daqiqada)
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

// Har 5 daqiqada keshni tozalash
setInterval(() => cache.clean(), 5 * 60 * 1000);

// =========================================================
// ROUTE'LAR - OPTIMALLASHTIRILGAN
// =========================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(),
    cacheSize: cache.store.size,
    memory: process.memoryUsage()
  });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: '🎬 MovieHub API', 
    version: '1.0.0',
    endpoints: ['/api/movies', '/api/admin/login']
  });
});

// -------------------- MOVIES (TEZKOR) --------------------
app.get('/api/movies', async (req, res) => {
  try {
    const cacheKey = 'all_movies';
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ 
        success: true, 
        count: cached.length, 
        data: cached,
        cached: true 
      });
    }

    const movies = await Movie.find()
      .sort({ createdAt: -1 })
      .select('-__v')
      .lean()
      .limit(50);

    cache.set(cacheKey, movies);
    
    res.json({ 
      success: true, 
      count: movies.length, 
      data: movies 
    });
  } catch (error) {
    console.error('Movies error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server xatosi' 
    });
  }
});

app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }

    const cacheKey = `search_${q.trim().toLowerCase()}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ 
        success: true, 
        count: cached.length, 
        data: cached,
        cached: true 
      });
    }

    const movies = await Movie.find({
      $or: [
        { nomi: { $regex: q.trim(), $options: 'i' } },
        { janr: { $regex: q.trim(), $options: 'i' } }
      ]
    })
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean()
    .limit(50);

    cache.set(cacheKey, movies, 15000); // 15 soniya
    
    res.json({ 
      success: true, 
      count: movies.length, 
      data: movies 
    });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server xatosi' 
    });
  }
});

app.get('/api/movies/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Noto\'g\'ri ID' 
      });
    }

    const cacheKey = `movie_${id}`;
    const cached = cache.get(cacheKey);
    
    if (cached) {
      return res.json({ 
        success: true, 
        data: cached,
        cached: true 
      });
    }

    const movie = await Movie.findById(id).select('-__v').lean();
    
    if (!movie) {
      return res.status(404).json({ 
        success: false, 
        message: 'Film topilmadi' 
      });
    }

    // Ko'rishlar sonini oshirish (async, javobni kutmaydi)
    Movie.findByIdAndUpdate(id, { $inc: { views: 1 } }).catch(() => {});

    cache.set(cacheKey, movie, 60000); // 60 soniya
    
    res.json({ 
      success: true, 
      data: movie 
    });
  } catch (error) {
    console.error('Movie detail error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server xatosi' 
    });
  }
});

// -------------------- ADMIN ROUTE'LAR --------------------
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi'
      });
    }

    const admin = await Admin.findOne({ username }).lean();
    
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
      { id: admin._id, username: admin.username },
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server xatosi'
    });
  }
});

// POST - Film qo'shish (Admin)
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    cache.clear(); // Keshni tozalash
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    console.error('Create error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Film yangilash (Admin)
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
    cache.clear(); // Keshni tozalash
    res.json({ success: true, data: movie });
  } catch (error) {
    console.error('Update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Film o'chirish (Admin)
app.delete('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    cache.clear(); // Keshni tozalash
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    console.error('Delete error:', error);
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
    await mongoose.connect(
      process.env.MONGO_URI || 'mongodb://localhost:27017/moviehub',
      mongooseOptions
    );
    console.log('✅ MongoDB ulandi.');
  } catch (error) {
    console.error('❌ MongoDB xatosi:', error);
    process.exit(1);
  }
}

// =========================================================
// ADMIN INIT
// =========================================================
async function initAdmin() {
  try {
    const count = await Admin.countDocuments();
    if (count === 0) {
      const username = process.env.ADMIN_USERNAME || 'admin';
      const password = process.env.ADMIN_PASSWORD || 'kuchli_parol123';
      
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);
      
      await Admin.create({ username, password: hashedPassword });
      console.log(`✅ Admin yaratildi: ${username} / ${password}`);
    }
  } catch (error) {
    console.error('Admin init xatosi:', error);
  }
}

// =========================================================
// SERVER
// =========================================================
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

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('👋 Server to\'xtatilmoqda (SIGTERM)...');
  mongoose.connection.close().then(() => process.exit(0));
});
