// =========================================================
// CACHE MIDDLEWARE - In-memory kesh
// =========================================================

class Cache {
  constructor() {
    this.store = new Map();
    this.defaultTTL = 30000; // 30 soniya
    this.maxSize = 100; // Maksimal 100 ta element
  }

  // Keshdan olish
  get(key) {
    const item = this.store.get(key);
    if (!item) return null;
    
    // TTL tekshirish
    if (Date.now() - item.timestamp > item.ttl) {
      this.store.delete(key);
      return null;
    }
    return item.data;
  }

  // Keshga saqlash
  set(key, data, ttl = this.defaultTTL) {
    // Agar kesh to'lib ketgan bo'lsa, eng eski elementni o'chirish
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      this.store.delete(oldestKey);
    }
    
    this.store.set(key, { 
      data, 
      timestamp: Date.now(), 
      ttl 
    });
  }

  // Keshni tozalash
  clear() { 
    this.store.clear(); 
  }

  // Eski keshni tozalash
  clean() {
    const now = Date.now();
    for (const [key, item] of this.store) {
      if (now - item.timestamp > item.ttl) {
        this.store.delete(key);
      }
    }
  }

  // Kesh hajmi
  size() {
    return this.store.size;
  }
}

module.exports = new Cache();
