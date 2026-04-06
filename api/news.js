'use strict';

const News = require('../models/News');

// GET /api/news?page=0&limit=10
async function getNews(req, res) {
  try {
    var page  = parseInt(req.query.page)  || 0;
    var limit = parseInt(req.query.limit) || 10;
    if (limit > 20) limit = 20;

    var list = await News.find({ isActive: true })
      .sort({ createdAt: -1 })
      .skip(page * limit)
      .limit(limit);

    var total = await News.countDocuments({ isActive: true });

    res.json({
      news:    list,
      total,
      page,
      hasMore: (page + 1) * limit < total
    });
  } catch (e) {
    console.error('[API/news]', e.message);
    res.status(500).json({ error: 'Xato' });
  }
}

// GET /api/news/:id — bitta yangilik
async function getOneNews(req, res) {
  try {
    var item = await News.findOne({ _id: req.params.id, isActive: true });
    if (!item) return res.status(404).json({ error: 'Topilmadi' });
    res.json({ news: item });
  } catch (e) {
    res.status(500).json({ error: 'Xato' });
  }
}

module.exports = { getNews, getOneNews };
