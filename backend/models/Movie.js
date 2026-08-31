const mongoose = require('mongoose');

// Qism Schema
const QismSchema = new mongoose.Schema({
  qismRaqami: { type: Number, required: true },
  video: { type: String, required: true },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  dislikedBy: [{ type: String }]
});

// Movie Schema
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
  qismlar: [QismSchema],
  views: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String }],
  dislikedBy: [{ type: String }]
}, { timestamps: true });

module.exports = mongoose.model('Movie', MovieSchema);
