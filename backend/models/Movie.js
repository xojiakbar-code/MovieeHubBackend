// Film/serial ma'lumotlari uchun Mongoose modeli
const mongoose = require('mongoose');

const movieSchema = new mongoose.Schema({
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
    required: true
  },
  davlati: {
    type: String,
    required: true
  },
  yili: {
    type: Number,
    required: true
  },
  tili: {
    type: String,
    required: true
  },
  yoshChegarasi: {
    type: String,
    required: true,
    default: '0+'
  },
  davomiyligi: {
    type: String,
    required: true
  },
  rasm: {
    type: String,
    required: true // Rasm fayli yo'li yoki URL
  },
  video: {
    type: String, // Agar film bo'lsa, bitta video
    required: function() {
      return this.turi === 'film';
    }
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
  timestamps: true // Yaratilgan va yangilangan vaqtlarni avtomatik qo'shadi
});

module.exports = mongoose.model('Movie', movieSchema);
