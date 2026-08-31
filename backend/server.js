// =========================================================
// MOVIEHUB BACKEND - TO'LIQ (OPTIMALLASHTIRILGAN)
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
// MIDDLEWARE
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
  lastModified: true
}));

// =========================================================
// MONGODB
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
const QismSchema = new mongoose.Schema({
  qismRaqami: { type: Number, required: true },
  video: { type: String, required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  dislikedBy: [{ type: String }]
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
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  dislikedBy: [{ type: String }]
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
// AUTH
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
  res.json({ status: 'OK', uptime: process.uptime(), cacheSize: cache.store.size });
});

app.get('/', (req, res) => {
  res.json({ success: true, message: '🎬 MovieHub API', version: '1.0.0' });
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
      const salt = await bcrypt.genSalt(10);
      admin.password = await bcrypt.hash(newPassword, salt);
      admin.tokenVersion = (admin.tokenVersion || 0) + 1;
    }

    await admin.save();

    const token = jwt.sign(
      { id: admin._id, username: admin.username, tokenVersion: admin.tokenVersion },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );

    res.json({ success: true, message: 'Ma\'lumotlar yangilandi', token, admin: { id: admin._id, username: admin.username } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server xatosi' });
  }
});

// =========================================================
// MOVIES ROUTE'LAR
// =========================================================
app.get('/api/movies', async (req, res) => {
  try {
    const cached = cache.get('all_movies');
    if (cached) {
      return res.json({ success: true, count: cached.length, data: cached, cached: true });
    }
    const movies = await Movie.find().sort({ createdAt: -1 }).lean().limit(50);
    cache.set('all_movies', movies);
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

// =========================================================
// LIKE / DISLIKE (TUZATILGAN)
// =========================================================

app.post('/api/movies/:id/like', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    const userKey = userId.toString();

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const alreadyLiked = movie.likedBy.includes(userKey);
    const alreadyDisliked = movie.dislikedBy.includes(userKey);

    if (alreadyLiked) {
      movie.likes = Math.max(0, movie.likes - 1);
      movie.likedBy = movie.likedBy.filter(id => id !== userKey);
    } else {
      movie.likes += 1;
      movie.likedBy.push(userKey);
      if (alreadyDisliked) {
        movie.dislikes = Math.max(0, movie.dislikes - 1);
        movie.dislikedBy = movie.dislikedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    // Keshni tozalash
    cache.clear();

    res.json({
      success: true,
      data: {
        likes: movie.likes,
        dislikes: movie.dislikes,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey)
      }
    });
  } catch (error) {
    console.error('Like xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/movies/:id/dislike', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    const userKey = userId.toString();

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const alreadyLiked = movie.likedBy.includes(userKey);
    const alreadyDisliked = movie.dislikedBy.includes(userKey);

    if (alreadyDisliked) {
      movie.dislikes = Math.max(0, movie.dislikes - 1);
      movie.dislikedBy = movie.dislikedBy.filter(id => id !== userKey);
    } else {
      movie.dislikes += 1;
      movie.dislikedBy.push(userKey);
      if (alreadyLiked) {
        movie.likes = Math.max(0, movie.likes - 1);
        movie.likedBy = movie.likedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();

    // Keshni tozalash
    cache.clear();

    res.json({
      success: true,
      data: {
        likes: movie.likes,
        dislikes: movie.dislikes,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey)
      }
    });
  } catch (error) {
    console.error('Dislike xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// LIKE / DISLIKE - QISM UCHUN
// =========================================================

app.post('/api/movies/:id/qism/:qismIndex/like', async (req, res) => {
  try {
    const { id, qismIndex } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    const userKey = userId.toString();

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const index = parseInt(qismIndex);
    if (index < 0 || index >= movie.qismlar.length) {
      return res.status(400).json({ success: false, message: 'Qism topilmadi' });
    }

    const qism = movie.qismlar[index];
    const alreadyLiked = qism.likedBy.includes(userKey);
    const alreadyDisliked = qism.dislikedBy.includes(userKey);

    if (alreadyLiked) {
      qism.likes = Math.max(0, qism.likes - 1);
      qism.likedBy = qism.likedBy.filter(id => id !== userKey);
    } else {
      qism.likes += 1;
      qism.likedBy.push(userKey);
      if (alreadyDisliked) {
        qism.dislikes = Math.max(0, qism.dislikes - 1);
        qism.dislikedBy = qism.dislikedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();
    cache.clear();

    res.json({
      success: true,
      data: {
        likes: qism.likes,
        dislikes: qism.dislikes,
        userLiked: qism.likedBy.includes(userKey),
        userDisliked: qism.dislikedBy.includes(userKey),
        qismIndex: index
      }
    });
  } catch (error) {
    console.error('Qism like xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.post('/api/movies/:id/qism/:qismIndex/dislike', async (req, res) => {
  try {
    const { id, qismIndex } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    const userKey = userId.toString();

    const movie = await Movie.findById(id);
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const index = parseInt(qismIndex);
    if (index < 0 || index >= movie.qismlar.length) {
      return res.status(400).json({ success: false, message: 'Qism topilmadi' });
    }

    const qism = movie.qismlar[index];
    const alreadyLiked = qism.likedBy.includes(userKey);
    const alreadyDisliked = qism.dislikedBy.includes(userKey);

    if (alreadyDisliked) {
      qism.dislikes = Math.max(0, qism.dislikes - 1);
      qism.dislikedBy = qism.dislikedBy.filter(id => id !== userKey);
    } else {
      qism.dislikes += 1;
      qism.dislikedBy.push(userKey);
      if (alreadyLiked) {
        qism.likes = Math.max(0, qism.likes - 1);
        qism.likedBy = qism.likedBy.filter(id => id !== userKey);
      }
    }

    await movie.save();
    cache.clear();

    res.json({
      success: true,
      data: {
        likes: qism.likes,
        dislikes: qism.dislikes,
        userLiked: qism.likedBy.includes(userKey),
        userDisliked: qism.dislikedBy.includes(userKey),
        qismIndex: index
      }
    });
  } catch (error) {
    console.error('Qism dislike xatosi:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

app.get('/api/movies/:id/rating', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.headers['x-forwarded-for'] || req.ip || 'anonymous';
    const userKey = userId.toString();

    const movie = await Movie.findById(id).select('likes dislikes likedBy dislikedBy qismlar');
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }

    const qismRating = movie.qismlar.map((qism, index) => ({
      index,
      likes: qism.likes || 0,
      dislikes: qism.dislikes || 0,
      userLiked: qism.likedBy.includes(userKey),
      userDisliked: qism.dislikedBy.includes(userKey)
    }));

    res.json({
      success: true,
      data: {
        likes: movie.likes || 0,
        dislikes: movie.dislikes || 0,
        userLiked: movie.likedBy.includes(userKey),
        userDisliked: movie.dislikedBy.includes(userKey),
        qismlar: qismRating
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// =========================================================
// ADMIN CRUD
// =========================================================
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    cache.clear();
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

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

// =========================================================
// 404
// =========================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Manzil topilmadi' });
});

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
      await Admin.create({ username, password: hashedPassword, tokenVersion: 0 });
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
    console.log(`🔑 Login: admin / kuchli_parol123`);
  });
}

startServer();

process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});
