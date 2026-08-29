// =========================================================
// MOVIEHUB BACKEND - OPTIMALLASHTIRILGAN
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
// MIDDLEWARE - TEZKOR
// =========================================================
app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Uploads papkasi
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath, {
  maxAge: '1d',
  setHeaders: (res) => {
    res.set('Cache-Control', 'public, max-age=86400');
  }
}));

// =========================================================
// MONGODB SCHEMALAR (TEZKOR)
// =========================================================
const MovieSchema = new mongoose.Schema({
  nomi: { type: String, required: true, trim: true, index: true },
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
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

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
// AUTH MIDDLEWARE
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
// ROUTE'LAR (TEZKOR)
// =========================================================
app.get('/', (req, res) => {
  res.json({ success: true, message: '🎬 MovieHub API', version: '1.0.0' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// GET - Barcha filmlar (tezkor)
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 }).lean().limit(50);
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Qidiruv (tezkor)
app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim() === '') {
      return res.json({ success: true, data: [] });
    }
    const movies = await Movie.find({
      nomi: { $regex: q.trim(), $options: 'i' }
    }).sort({ createdAt: -1 }).lean().limit(50);
    res.json({ success: true, count: movies.length, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Bitta film (tezkor)
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

// POST - Film qo'shish
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT - Film yangilash
app.put('/api/movies/:id', auth, async (req, res) => {
  try {
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!movie) {
      return res.status(404).json({ success: false, message: 'Film topilmadi' });
    }
    res.json({ success: true, data: movie });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// DELETE - Film o'chirish
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

// ADMIN LOGIN
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
    
    const isValid = await admin.comparePassword(password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Noto\'g\'ri ma\'lumotlar' });
    }
    
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    res.json({ success: true, token, admin: { id: admin._id, username: admin.username } });
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
  console.error('❌ Xatolik:', err.message);
  res.status(500).json({ success: false, message: err.message });
});

// =========================================================
// MONGODB ULASH
// =========================================================
async function connectDB() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/moviehub');
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
      
      await Admin.create({ username, password: hashedPassword });
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
  });
}

startServer();

// To'g'ri yopish
process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('👋 Server to\'xtatilmoqda (SIGTERM)...');
  mongoose.connection.close().then(() => process.exit(0));
});
