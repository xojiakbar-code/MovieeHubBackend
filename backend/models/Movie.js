// =========================================================
// MOVIE MODELI - LIKE/DISLIKE QO'SHILGAN
// =========================================================
const mongoose = require('mongoose');

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
  }],
  views: { type: Number, default: 0 },
  rating: { type: Number, default: 0 },
  // ===== LIKE/DISLIKE =====
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String }], // Foydalanuvchi ID yoki IP
  dislikedBy: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Movie', MovieSchema);
