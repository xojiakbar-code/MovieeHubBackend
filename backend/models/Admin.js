// =========================================================
// ADMIN MODELI - YANGILANGAN (tokenVersion qo'shildi)
// =========================================================
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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
  },
  tokenVersion: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

// Parolni hash qilish
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

// Parolni tekshirish
AdminSchema.methods.comparePassword = async function(candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (error) {
    console.error('Parol tekshirish xatosi:', error);
    return false;
  }
};

module.exports = mongoose.model('Admin', AdminSchema);
