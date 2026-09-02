// =========================================================
// MOVIEHUB BACKEND - OPTIMALLASHTIRILGAN & MUSTAHKAMLANGAN
// =========================================================
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

// Security
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');

// Performance
const compression = require('compression');
const cache = require('./middleware/cache');
const {
  compress,
  responseTime,
  cacheHeaders,
  limiter,
  requestId
} = require('./middleware/performance');

const app = express();
const PORT = process.env.PORT || 5000;

// =========================================================
// PERFORMANCE MIDDLEWARE (Eng muhim)
// =========================================================
app.use(compression); // Javoblarni siqish
app.use(responseTime); // So'rov vaqtini o'lchash
app.use(cacheHeaders); // Kesh headerlari
app.use(requestId); // Har bir so'rovga ID

// =========================================================
// SECURITY MIDDLEWARE
// =========================================================

// 1. Helmet
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://www.youtube.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", "https://movieehubbackend.onrender.com", "https://movihub.pages.dev"],
      frameSrc: ["'self'", "https://www.youtube.com"],
      mediaSrc: ["'self'", "https:", "http:"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// 2. Rate Limiting
app.use('/api/', limiter);

// 3. XSS va injeksiya himoyasi
app.use(mongoSanitize());
app.use(xss());
app.use(hpp({
  whitelist: ['nomi', 'janr', 'yili', 'turi']
}));

// 4. CORS
const allowedOrigins = [
  'https://movihub.pages.dev',
  'https://moviehub.pages.dev',
  'https://*.pages.dev',
  'http://localhost:3000',
  'http://localhost:5000'
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.some(allowed => origin.match(allowed.replace(/\*/g, '.*')))) {
      callback(null, true);
    } else {
      callback(new Error('CORS ruxsat etilmagan'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
  maxAge: 86400
}));

// 5. JSON parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 6. Static files
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=604800, immutable');
  }
}));

// =========================================================
// MONGODB CONNECTION - OPTIMALLASHTIRILGAN
// =========================================================
const mongooseOptions = {
  maxPoolSize: 25, // Maksimal ulanishlar
  minPoolSize: 5,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 5000,
  serverSelectionTimeoutMS: 3000,
  heartbeatFrequencyMS: 5000,
  retryWrites: true,
  retryReads: true,
  family: 4,
  autoIndex: process.env.NODE_ENV !== 'production',
  readPreference: 'secondaryPreferred'
};

// =========================================================
// SCHEMALAR - INDEXLAR BILAN
// =========================================================

const QismSchema = new mongoose.Schema({
  qismRaqami: { type: Number, required: true },
  video: { type: String, required: true }
});

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
  qismlar: [QismSchema],
  views: { type: Number, default: 0 }
}, { timestamps: true });

// =========================================================
// INDEXLAR - TEZLIK UCHUN (ENG MUHIM)
// =========================================================
MovieSchema.index({ turi: 1, yili: -1 });
MovieSchema.index({ janr: 1, yili: -1 });
MovieSchema.index({ nomi: 'text', janr: 'text' });
MovieSchema.index({ createdAt: -1 });

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  tokenVersion: { type: Number, default: 0 }
}, { timestamps: true });

AdminSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(12);
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
// AUTH MIDDLEWARE
// =========================================================
const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token topilmadi' });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'default_secret');
    const admin = await Admin.findById(decoded.id).select('username tokenVersion');
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Admin topilmadi' });
    }

    if (decoded.tokenVersion !== admin.tokenVersion) {
      return res.status(401).json({
        success: false,
        message: 'Ma\'lumotlar o\'zgartirilgan. Qayta kiring.',
        forceLogout: true
      });
    }

    req.admin = { id: admin._id, username: admin.username, tokenVersion: admin.tokenVersion };
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Noto\'g\'ri token' });
  }
};

// =========================================================
// ROUTE'LAR
// =========================================================
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    uptime: process.uptime(), 
    cacheSize: cache.size(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString()
  });
});

app.get('/', (req, res) => {
  res.json({ 
    success: true, 
    message: '🎬 MovieHub API', 
    version: '1.0.0',
    performance: {
      compression: true,
      cache: true,
      rateLimit: true
    }
  });
});

// =========================================================
// ADMIN ROUTE'LAR
// =========================================================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username va parol talab qilinadi' });
    }

    const admin = await Admin.findOne({ username });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Noto\'g\'ri ma\'lumotlar' });
    }

    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Noto\'g\'ri ma\'lumotlar' });
    }

    const token = jwt.sign(
      { id: admin._id, username: admin.username, tokenVersion: admin.tokenVersion || 0 },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    res.json({ success: true, token, admin: { id: admin._id, username: admin.username } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

app.get('/api/admin/me', auth, async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin.id).select('-password');
    res.json({ success: true, data: admin });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

app.put('/api/admin/update', auth, async (req, res) => {
  try {
    const { username, currentPassword, newPassword } = req.body;
    const admin = await Admin.findById(req.admin.id);
    if (!admin) {
      return res.status(404).json({ success: false, message: 'Admin topilmadi' });
    }

    if (username && username !== admin.username) {
      const existing = await Admin.findOne({ username });
      if (existing) {
        return res.status(400).json({ success: false, message: 'Bu username mavjud' });
      }
      admin.username = username;
    }

    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ success: false, message: 'Joriy parolni kiriting' });
      }
      const isValid = await bcrypt.compare(currentPassword, admin.password);
      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Joriy parol noto\'g\'ri' });
      }
      const salt = await bcrypt.genSalt(12);
      admin.password = await bcrypt.hash(newPassword, salt);
      admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    }

    await admin.save();

    const token = jwt.sign(
      { id: admin._id, username: admin.username, tokenVersion: admin.tokenVersion },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({ 
      success: true, 
      message: 'Ma\'lumotlar yangilandi', 
      token, 
      admin: { id: admin._id, username: admin.username } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// =========================================================
// MOVIES ROUTE'LAR - KESH BILAN
// =========================================================
app.get('/api/movies', async (req, res) => {
  try {
    // Keshdan tekshirish
    const cached = cache.get('all_movies');
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

    // Keshga saqlash
    cache.set('all_movies', movies);

    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }

    const query = q.trim();
    const cacheKey = `search_${query.toLowerCase()}`;
    
    // Keshdan tekshirish
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
        { nomi: { $regex: query, $options: 'i' } },
        { janr: { $regex: query, $options: 'i' } }
      ]
    })
    .sort({ createdAt: -1 })
    .select('-__v')
    .lean();

    // Keshga saqlash (15 soniya)
    cache.set(cacheKey, movies, 15000);

    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

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

    // Ko'rishlar sonini oshirish (async)
    Movie.findByIdAndUpdate(id, { $inc: { views: 1 } }).catch(() => {});

    // Keshga saqlash (60 soniya)
    cache.set(cacheKey, movie, 60000);

    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// =========================================================
// ADMIN CRUD
// =========================================================
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    cache.clear(); // Keshni tozalash
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.put('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) return res.status(404).json({ success: false, message: 'Film topilmadi' });
    cache.clear(); // Keshni tozalash
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

app.delete('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndDelete(req.params.id);
    if (!movie) return res.status(404).json({ success: false, message: 'Film topilmadi' });
    cache.clear(); // Keshni tozalash
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// 404 & ERROR HANDLER
// =========================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Manzil topilmadi' });
});

app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({ 
    success: false, 
    message: process.env.NODE_ENV === 'production' ? 'Server xatosi' : err.message 
  });
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
      const salt = await bcrypt.genSalt(12);
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

// =========================================================
// SERVER START
// =========================================================
async function startServer() {
  await connectDB();
  await initAdmin();
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda`);
    console.log(`🔑 Login: admin / kuchli_parol123`);
    console.log(`💾 Kesh hajmi: ${cache.size()}`);
    console.log(`🛡️ Security: Faol`);
    console.log(`⚡ Compression: Faol`);
  });
}

startServer();

// =========================================================
// GRACEFUL SHUTDOWN
// =========================================================
process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});
