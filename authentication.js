exports.checkUser = function (req, res, next) {
  if (req.session.user === undefined) {
    res.redirect('/login');
  } else {
    next();
  }
};