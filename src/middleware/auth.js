function requireAuth(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

function requireAuthPage(req, res, next) {
  if (!req.session?.userId) {
    return res.redirect('/login');
  }
  next();
}

module.exports = { requireAuth, requireAuthPage };
