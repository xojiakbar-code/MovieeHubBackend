const mongoose = require('mongoose');

// Qism Schema
const QismSchema = new mongoose.Schema({
  qismRaqami: { type: Number, required: true },
  video: { type: String, required: true }
});

// Movie Schema - Like/Dislike olib tashlandi
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

MovieSchema.index({ nomi: 'text' });
MovieSchema.index({ turi: 1, yili: -1 });
MovieSchema.index({ janr: 1, yili: -1 });

module.exports = mongoose.model('Movie', MovieSchema);
