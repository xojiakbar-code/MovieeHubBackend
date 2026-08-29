// =========================================================
// MOVIEHUB BACKEND - TO'LIQ (LOGIN TUZATILGAN)
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
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Uploads papkasi
const uploadsPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsPath)) {
  fs.mkdirSync(uploadsPath, { recursive: true });
}
app.use('/uploads', express.static(uploadsPath));

// =========================================================
// MONGODB SCHEMALAR
// =========================================================
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
// AUTH
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
// ROUTE'LAR
// =========================================================
app.get('/', (req, res) => {
  res.json({ success: true, message: '🎬 MovieHub API' });
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', uptime: process.uptime() });
});

// MOVIES
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
    const movie = await Movie.findByIdAndUpdate(req.params.id, req.body, { new: true });
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

// =========================================================
// ADMIN LOGIN (TUZATILGAN - KO'PROQ LOG BILAN)
// =========================================================
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    console.log('========================================');
    console.log('🔑 LOGIN SO\'ROVI KELDI');
    console.log(`   Username: ${username}`);
    console.log(`   Password: ${password ? '*****' : 'Yo\'q'}`);
    console.log('========================================');
    
    if (!username || !password) {
      console.log('❌ Username yoki parol yo\'q');
      return res.status(400).json({
        success: false,
        message: 'Username va parol talab qilinadi'
      });
    }
    
    // BAZADAGI BARCHA ADMINLARNI KO'RSATISH
    const allAdmins = await Admin.find({}, 'username');
    console.log(`📋 Bazadagi adminlar: ${allAdmins.map(a => a.username).join(', ') || 'HECH KIM YO\'Q'}`);
    
    // ADMINNI TOPISH
    const admin = await Admin.findOne({ username });
    console.log(`👤 Admin topildi: ${admin ? 'HA' : 'YO\'Q'}`);
    
    if (!admin) {
      console.log('❌ Admin topilmadi!');
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // PAROLNI TEKSHIRISH
    console.log(`🔐 Parol tekshiruvi...`);
    const isValid = await admin.comparePassword(password);
    console.log(`🔐 Parol natijasi: ${isValid ? '✅ TO\'G\'RI' : '❌ NOTO\'G\'RI'}`);
    
    if (!isValid) {
      console.log('❌ Parol noto\'g\'ri!');
      return res.status(401).json({
        success: false,
        message: 'Noto\'g\'ri ma\'lumotlar'
      });
    }
    
    // TOKEN YARATISH
    const token = jwt.sign(
      { id: admin._id, username: admin.username },
      process.env.JWT_SECRET || 'default_secret',
      { expiresIn: '7d' }
    );
    
    console.log('✅ Login muvaffaqiyatli! Token yaratildi');
    console.log('========================================');
    
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

// =========================================================
// 404
// =========================================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Manzil topilmadi' });
});

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

// =========================================================
// ADMIN FORCE RESET (MUHIM!)
// =========================================================
async function forceResetAdmin() {
  try {
    const username = 'admin';
    const newPassword = 'kuchli_parol123';
    
    console.log('🔄 Admin parolni qayta o\'rnatish...');
    
    // 1. Eski adminlarni o'chirish
    await Admin.deleteMany({});
    console.log('✅ Eski adminlar o\'chirildi');
    
    // 2. Yangi admin yaratish
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    await Admin.create({
      username: username,
      password: hashedPassword
    });
    
    console.log(`✅ Admin qayta yaratildi!`);
    console.log(`   👤 Username: ${username}`);
    console.log(`   🔑 Password: ${newPassword}`);
    
    // 3. Bazadagi adminlarni ko'rsatish
    const allAdmins = await Admin.find({});
    console.log(`📋 Bazadagi adminlar: ${allAdmins.map(a => a.username).join(', ')}`);
    
    return true;
  } catch (error) {
    console.error('❌ Admin reset xatosi:', error);
    return false;
  }
}

// =========================================================
// SERVER
// =========================================================
async function startServer() {
  await connectDB();
  await forceResetAdmin(); // <-- Admin qayta o'rnatiladi
  
  app.listen(PORT, () => {
    console.log(`🚀 Server ${PORT}-portda`);
    console.log(`🔑 Login: admin / kuchli_parol123`);
    console.log(`🌐 http://localhost:${PORT}`);
  });
}

startServer();

// =========================================================
// YOPISH
// =========================================================
process.on('SIGINT', () => {
  console.log('👋 Server to\'xtatilmoqda...');
  mongoose.connection.close().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('👋 Server to\'xtatilmoqda (SIGTERM)...');
  mongoose.connection.close().then(() => process.exit(0));
});
