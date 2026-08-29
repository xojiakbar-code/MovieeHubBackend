// Asosiy server fayli - Optimallashtirilgan
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// ============ MIDDLEWARE'LAR (TEZKOR) ============
app.use(cors({
  origin: '*', // Tezlik uchun barcha originlarga ruxsat
  credentials: true
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Uploads papkasini yaratish
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// ============ MODELLAR ============
const MovieSchema = new mongoose.Schema({
  nomi: { type: String, required: true },
  turi: { type: String, enum: ['film', 'serial'], required: true },
  janr: { type: String, required: true },
  davlati: { type: String, required: true },
  yili: { type: Number, required: true },
  tili: { type: String, required: true },
  yoshChegarasi: { type: String, default: '0+' },
  davomiyligi: { type: String, required: true },
  rasm: { type: String, required: true },
  video: { type: String },
  qismlar: [{ qismRaqami: Number, video: String }]
}, { timestamps: true });

const AdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

const Movie = mongoose.model('Movie', MovieSchema);
const Admin = mongoose.model('Admin', AdminSchema);

// ============ AUTH MIDDLEWARE ============
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ success: false, message: 'Token topilmadi' });
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Noto\'g\'ri token' });
  }
};

// ============ ROUTE'LAR ============
// GET - Barcha filmlar
app.get('/api/movies', async (req, res) => {
  try {
    const movies = await Movie.find().sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Qidiruv
app.get('/api/movies/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ success: true, data: [] });
    const movies = await Movie.find({ 
      nomi: { $regex: q, $options: 'i' } 
    }).lean();
    res.json({ success: true, data: movies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET - Bitta film
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

// POST - Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Noto\'g\'ri ma\'lumotlar' });
    }
    
    const isValid = await bcrypt.compare(password, admin.password);
    if (!isValid) {
      return res.status(401).json({ success: false, message: 'Noto\'g\'ri ma\'lumotlar' });
    }
    
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    res.json({ 
      success: true, 
      token, 
      admin: { id: admin._id, username: admin.username } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST - Film qo'shish (Admin)
app.post('/api/movies', auth, async (req, res) => {
  try {
    const movie = await Movie.create(req.body);
    res.status(201).json({ success: true, data: movie });
  } catch (error) {
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
    res.json({ success: true, data: movie });
  } catch (error) {
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
    res.json({ success: true, message: 'Film o\'chirildi' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// Root
app.get('/', (req, res) => {
  res.json({ 
    message: 'MovieHub API ishlamoqda',
    endpoints: ['/api/movies', '/api/admin/login']
  });
});

// ============ MONGODB ULASH ============
async function startServer() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ MongoDB ulandi');
    
    // Admin yaratish
    const adminCount = await Admin.countDocuments();
    if (adminCount === 0) {
      const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'admin123', 10);
      await Admin.create({
        username: process.env.ADMIN_USERNAME || 'admin',
        password: hashedPassword
      });
      console.log('✅ Admin yaratildi');
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Server ${PORT}-portda ishlamoqda`);
    });
  } catch (error) {
    console.error('❌ Xatolik:', error);
    process.exit(1);
  }
}

startServer();
